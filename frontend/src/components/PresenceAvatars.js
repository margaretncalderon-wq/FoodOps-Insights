import { useState } from "react";

// Color palette for user avatars (consistent per user)
const AVATAR_COLORS = [
  "#3B82F6", "#EF4444", "#10B981", "#F59E0B", "#8B5CF6",
  "#EC4899", "#06B6D4", "#F97316", "#6366F1", "#14B8A6"
];

function getColorForUser(userId) {
  let hash = 0;
  for (let i = 0; i < (userId || "").length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getInitials(name) {
  if (!name) return "?";
  const parts = name.trim().split(" ");
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return parts[0][0].toUpperCase();
}

/**
 * Single presence avatar with tooltip
 */
function PresenceAvatar({ user, size = "sm", showActivity = false }) {
  const [showTooltip, setShowTooltip] = useState(false);
  const color = getColorForUser(user.user_id);
  const initials = getInitials(user.name);
  
  const sizes = {
    xs: "w-5 h-5 text-[8px]",
    sm: "w-7 h-7 text-[10px]",
    md: "w-8 h-8 text-xs",
    lg: "w-10 h-10 text-sm"
  };

  return (
    <div 
      className="relative"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <div 
        className={`${sizes[size]} rounded-full flex items-center justify-center text-white font-semibold ring-2 ring-white cursor-default`}
        style={{ backgroundColor: color }}
        data-testid="presence-avatar"
      >
        {user.avatar ? (
          <img src={user.avatar} alt={user.name} className="w-full h-full rounded-full object-cover" />
        ) : (
          initials
        )}
      </div>
      {/* Online dot */}
      <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-green-500 ring-2 ring-white" />
      
      {/* Tooltip */}
      {showTooltip && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 bg-gray-900 text-white text-xs rounded-lg whitespace-nowrap z-50 shadow-lg">
          <div className="font-medium">{user.name}</div>
          {showActivity && user.entity_title && (
            <div className="text-gray-300 text-[10px] mt-0.5">
              Editando: {user.entity_title}
            </div>
          )}
          {showActivity && user.page && !user.entity_title && (
            <div className="text-gray-300 text-[10px] mt-0.5">
              En: {user.page}
            </div>
          )}
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 w-2 h-2 bg-gray-900 rotate-45" />
        </div>
      )}
    </div>
  );
}

/**
 * Stack of presence avatars (overlapping, Figma-style)
 */
export function PresenceAvatarStack({ users = [], size = "sm", maxShow = 4, showActivity = false, label = "" }) {
  if (!users || users.length === 0) return null;
  
  const visible = users.slice(0, maxShow);
  const extra = users.length - maxShow;
  
  const overlapMap = { xs: "-ml-1.5", sm: "-ml-2", md: "-ml-2.5", lg: "-ml-3" };
  const overlap = overlapMap[size] || "-ml-2";

  return (
    <div className="flex items-center gap-1.5" data-testid="presence-stack">
      <div className="flex items-center">
        {visible.map((user, i) => (
          <div key={user.user_id} className={i > 0 ? overlap : ""} style={{ zIndex: visible.length - i }}>
            <PresenceAvatar user={user} size={size} showActivity={showActivity} />
          </div>
        ))}
        {extra > 0 && (
          <div className={`${overlap} w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-[10px] font-medium text-gray-600 ring-2 ring-white`} style={{ zIndex: 0 }}>
            +{extra}
          </div>
        )}
      </div>
      {label && <span className="text-xs text-muted-foreground">{label}</span>}
    </div>
  );
}

/**
 * Inline entity viewers - shows who else is viewing/editing (Figma-style bar)
 */
export function EntityPresenceBar({ viewers = [], isEs = true }) {
  if (!viewers || viewers.length === 0) return null;

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-100 rounded-lg" data-testid="entity-presence-bar">
      <PresenceAvatarStack users={viewers} size="xs" maxShow={3} />
      <span className="text-xs text-blue-600">
        {viewers.length === 1 
          ? `${viewers[0].name} ${isEs ? "está viendo esto" : "is viewing this"}`
          : `${viewers.length} ${isEs ? "personas viendo esto" : "people viewing this"}`
        }
      </span>
    </div>
  );
}

export default PresenceAvatar;
