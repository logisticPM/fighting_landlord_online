import React from 'react';

interface PlayerAvatarProps {
  seat: number;
  isLandlord: boolean;
  isCurrentPlayer?: boolean;
  x: number; // 像素位置
  y: number; // 像素位置
  size?: number; // 头像大小
  showSeatLabel?: boolean;
}

export const PlayerAvatar: React.FC<PlayerAvatarProps> = ({
  seat,
  isLandlord,
  isCurrentPlayer = false,
  x,
  y,
  size = 72,
  showSeatLabel = true
}) => {
  const avatarPath = isLandlord ? '/avatars/landlord.png' : '/avatars/farmer.png';
  const ringColor = isLandlord ? '#f59e0b' : '#1f2937'; // Orange for landlord, dark for farmer
  
  return (
    <div
      style={{
        position: 'absolute',
        left: x - size/2,
        top: y - size/2,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        pointerEvents: 'none',
        zIndex: 10
      }}
    >
      {/* Avatar container with ring */}
      <div
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          border: `3px solid ${ringColor}`,
          overflow: 'hidden',
          boxShadow: isCurrentPlayer 
            ? `0 0 0 3px yellow, 0 0 20px rgba(255, 255, 0, 0.5)` 
            : '0 2px 8px rgba(0, 0, 0, 0.3)',
          position: 'relative',
          animation: isCurrentPlayer ? 'pulse 2s infinite' : 'none'
        }}
      >
        {/* Avatar image */}
        <img
          src={avatarPath}
          alt={isLandlord ? 'landlord' : 'farmer'}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover', // ✅ Perfect scaling handled by browser
            display: 'block'
          }}
          onError={(e) => {
            // Fallback to colored circle if image fails to load
            const target = e.target as HTMLImageElement;
            target.style.display = 'none';
            const fallback = target.nextElementSibling as HTMLDivElement;
            if (fallback) fallback.style.display = 'flex';
          }}
        />
        
        {/* Fallback colored circle */}
        <div
          style={{
            display: 'none',
            width: '100%',
            height: '100%',
            backgroundColor: isLandlord ? '#ff6b35' : '#4a90e2',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontWeight: 'bold',
            fontSize: `${size * 0.3}px`
          }}
        >
          {isLandlord ? '地' : seat}
        </div>
      </div>
      
      {/* Seat label */}
      {showSeatLabel && (
        <div
          style={{
            marginTop: '4px',
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            color: 'white',
            padding: '2px 6px',
            borderRadius: '8px',
            fontSize: '12px',
            fontWeight: 'bold'
          }}
        >
          S{seat}
        </div>
      )}
      
      {/* Role indicator */}
      {isLandlord && (
        <div
          style={{
            marginTop: '2px',
            backgroundColor: '#f59e0b',
            color: 'white',
            padding: '1px 4px',
            borderRadius: '6px',
            fontSize: '10px',
            fontWeight: 'bold'
          }}
        >
          LANDLORD
        </div>
      )}
    </div>
  );
};

// CSS keyframes for pulse animation (inject into document)
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    @keyframes pulse {
      0% { box-shadow: 0 0 0 3px yellow, 0 0 20px rgba(255, 255, 0, 0.5); }
      50% { box-shadow: 0 0 0 6px rgba(255, 255, 0, 0.8), 0 0 30px rgba(255, 255, 0, 0.8); }
      100% { box-shadow: 0 0 0 3px yellow, 0 0 20px rgba(255, 255, 0, 0.5); }
    }
  `;
  document.head.appendChild(style);
}
