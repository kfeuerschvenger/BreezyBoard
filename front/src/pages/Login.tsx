import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '@/hooks/useAuth';
import AuthLayout from '@/components/AuthLayout';
import { ForgotPasswordModal, LoginForm } from '@/features/auth';
import type { LoginCredentials } from '@/models';

const Login = () => {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [apiError, setApiError] = useState<string | null>(null);
  const [forgotOpen, setForgotOpen] = useState(false);

  const signIn = async (credentials: LoginCredentials) => {
    setApiError(null);
    try {
      await login(credentials);
      navigate('/');
    } catch (error) {
      console.error('Login failed:', error);
      setApiError('Invalid credentials. Please try again.');
    }
  };

  return (
    <AuthLayout>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md mx-auto"
      >
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Welcome back</h1>
          <p className="text-gray-600">Sign in to your account to continue</p>
        </div>

        <LoginForm
          onSubmit={signIn}
          error={apiError}
          onDirty={() => setApiError(null)}
          onForgotPassword={() => setForgotOpen(true)}
        />

        <div className="mt-6 text-center">
          <p className="text-gray-600">
            Don't have an account?{' '}
            <Link to="/register" className="text-blue-600 hover:text-blue-500 font-medium">
              Sign up
            </Link>
          </p>
        </div>

        <ForgotPasswordModal open={forgotOpen} onClose={() => setForgotOpen(false)} />
      </motion.div>
    </AuthLayout>
  );
};

export default Login;
