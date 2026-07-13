export interface UserProfile {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  full_name: string | null;
  created_at: string;
  updated_at: string;
}

export type ProfileActionState = {
  error?: string | null;
  success?: boolean;
  fieldErrors?: {
    first_name?: string;
    last_name?: string;
    phone?: string;
  };
};
