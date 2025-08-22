export interface User {
  _id: string;
  firstName: string;
  lastName: string;
  email?: string;
  avatar: string;
  role?: string;
  department?: string;
  location?: string;
  createdAt?: string;
  updatedAt?: string;
}
