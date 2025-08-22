import type { User } from '@/models';

interface SimpleUserAvatarProps {
  user?: User;
  size?: 'sm' | 'md' | 'lg';
}

const SimpleUserAvatar = ({ user, size = 'md' }: SimpleUserAvatarProps) => {
  const sizeClasses = {
    sm: 'w-6 h-6 text-xs',
    md: 'w-8 h-8 text-sm',
    lg: 'w-12 h-12 text-lg',
  };

  if (!user) {
    return (
      <div className={`inline-flex items-center justify-center rounded-full bg-gray-200 ${sizeClasses[size]}`}>
        <span className="font-medium text-gray-500">?</span>
      </div>
    );
  }

  return (
    <div className={`inline-flex items-center justify-center rounded-full bg-blue-100 ${sizeClasses[size]}`}>
      {user.avatar ? (
        <img
          src={user.avatar}
          alt={`${user.firstName} ${user.lastName}`}
          className="rounded-full w-full h-full object-cover"
        />
      ) : (
        <span className="font-medium text-blue-800">
          {user.firstName?.[0]}
          {user.lastName?.[0]}
        </span>
      )}
    </div>
  );
};

export default SimpleUserAvatar;
