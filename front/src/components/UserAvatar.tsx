import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthService } from '@/services';
import type { User } from '@/models';
import { UserMenu } from '@/features/users';

/**
 * The page header's account control: who is signed in, and the two things
 * they can do about it.
 *
 * All this holds is the signed in person and what the two actions do.
 * Everything drawn is `features/users/UserMenu`.
 */
const UserAvatar: React.FC = () => {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  useEffect(() => {
    try {
      setCurrentUser(AuthService.getCurrentUser() ?? null);
    } catch (error) {
      // A corrupt stored session must not take the page down with it.
      console.error('Failed to get current user', error);
      setCurrentUser(null);
    }
  }, []);

  const logout = async () => {
    try {
      await AuthService.logout();
    } catch (error) {
      // Being unable to reach the server is the one moment somebody most
      // needs to be let out, so the navigation below happens either way.
      console.error('Logout failed', error);
    } finally {
      navigate('/login');
    }
  };

  if (!currentUser) return null;

  return <UserMenu user={currentUser} onProfile={() => navigate('/profile')} onLogout={logout} />;
};

export default UserAvatar;
