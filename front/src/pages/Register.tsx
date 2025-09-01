import React from 'react';
import { motion } from 'framer-motion';
import AuthLayout from '@/components/AuthLayout';
import RegisterForm from '@/components/RegisterForm';

const RegisterPage: React.FC = () => {
  return (
    <AuthLayout>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md mx-auto"
      >
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Create account</h1>
          <p className="text-gray-600">Join us and start managing your projects</p>
        </div>

        <RegisterForm />
      </motion.div>
    </AuthLayout>
  );
};

export default RegisterPage;
