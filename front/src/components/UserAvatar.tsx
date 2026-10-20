import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { UserMenu } from '@/features/users';

/**
 * The page header's account control: who is signed in, and the two things
 * they can do about it.
 *
 * The person is read from the auth context and not from the stored session
 * once on mount, so a name or a picture changed on the profile page shows here
 * at once. Everything drawn is `features/users/UserMenu`.
 */
const UserAvatar: React.FC = () => {
  const navigate = useNavigate();
  const { user: currentUser, logout: endSession } = useAuth();

  // Through the auth context and not the service: the context also empties the
  // query cache, which the service has no way to reach.
  const logout = async () => {
    try {
      await endSession();
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
