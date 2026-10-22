/** How much ambient motion the interface plays, from none to the most. */
export type BreezeLevel = 'still' | 'calm' | 'breezy' | 'gusty';

export interface User {
  _id: string;
  firstName: string;
  lastName: string;
  email?: string;
  avatar: string;
  role?: string;
  department?: string;
  location?: string;
  /** The person's Breeze setting. Records written before it existed read as `breezy`. */
  breeze?: BreezeLevel;
  createdAt?: string;
  updatedAt?: string;
}
