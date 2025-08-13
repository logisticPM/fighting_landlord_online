Param(
    [Parameter(Mandatory=$true)][string]$ResourceGroup,
    [Parameter(Mandatory=$true)][string]$Location,
    [Parameter(Mandatory=$true)][string]$AppNameBase,
    [Parameter(Mandatory=$false)][switch]$DeployClient = $true
)

# Requires: Azure CLI (az), Azure Functions Core Tools (func), Node.js

$ErrorActionPreference = 'Stop'

function Ensure-AzLogin {
    try {
        az account show 1>$null 2>$null
    } catch {
        Write-Host 'Signing in to Azure...' -ForegroundColor Cyan
        az login --use-device-code | Out-Null
    }
}

function New-Infra {
    Param([string]$rg,[string]$loc,[string]$nameBase)

    $suffix = (Get-Date -Format 'MMddHHmm').ToLower()
    $base = $nameBase.ToLower()
    $storageName = ($base + 'web' + $suffix).ToLower() -replace '[^a-z0-9]', ''
    $funcStorage = ($base + 'func' + $suffix).ToLower() -replace '[^a-z0-9]', ''
    $funcName = ($base + '-func-' + $suffix).ToLower()
    $signalrName = ($base + '-signalr-' + $suffix).ToLower()

    az group create -n $rg -l $loc | Out-Null

    # Static website storage
    az storage account create -n $storageName -g $rg -l $loc --sku Standard_LRS | Out-Null
    az storage blob service-properties update --account-name $storageName --static-website --index-document index.html --404-document index.html | Out-Null

    # Function app pre-req storage
    az storage account create -n $funcStorage -g $rg -l $loc --sku Standard_LRS | Out-Null

    # SignalR (Serverless)
    az signalr create -n $signalrName -g $rg -l $loc --sku Free_F1 --service-mode Serverless | Out-Null
    $signalrConn = az signalr key list -n $signalrName -g $rg --query primaryConnectionString -o tsv

    # Function App (Linux, Node 18, v4)
    az functionapp create `
        -g $rg `
        -n $funcName `
        --storage-account $funcStorage `
        --consumption-plan-location $loc `
        --functions-version 4 `
        --runtime node `
        --runtime-version 18 `
        --os-type Linux | Out-Null

    az functionapp config appsettings set -g $rg -n $funcName --settings AzureSignalRConnectionString="$signalrConn" | Out-Null

    return [PSCustomObject]@{ Storage=$storageName; FuncName=$funcName; SignalR=$signalrName }
}

function Publish-Functions {
    Param([string]$funcName)
    Push-Location "$PSScriptRoot/functions"
    npm ci
    npm run build
    func azure functionapp publish $funcName --nozip
    Pop-Location
}

function Deploy-Client {
    Param([string]$storageName)
    Push-Location "$PSScriptRoot/client"
    npm ci
    npm run build
    Pop-Location
    az storage blob upload-batch -s "$PSScriptRoot/client/dist" -d '$web' --account-name $storageName | Out-Null
}

Ensure-AzLogin

$infra = New-Infra -rg $ResourceGroup -loc $Location -nameBase $AppNameBase
Publish-Functions -funcName $infra.FuncName
if ($DeployClient) { Deploy-Client -storageName $infra.Storage }

$webUrl = az storage account show -n $($infra.Storage) -g $ResourceGroup --query "primaryEndpoints.web" -o tsv
$funcUrl = "https://$($infra.FuncName).azurewebsites.net/api"

try {
    $origin = $webUrl.TrimEnd('/')
    az functionapp cors add -g $ResourceGroup -n $($infra.FuncName) --allowed-origins $origin | Out-Null
} catch {
    Write-Host "CORS setup skipped or failed; configure manually if needed." -ForegroundColor Yellow
}

Write-Host "Web:    $webUrl" -ForegroundColor Green
Write-Host "API:    $funcUrl" -ForegroundColor Green
Write-Host "SignalR: $($infra.SignalR)" -ForegroundColor Green


