import { IronSession, unsealData } from 'iron-session';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export interface SessionData {
  isLoggedIn: boolean;
  github_token?: string;
  username?: string;
  avatarUrl?: string;
}

const sessionOptions = {
  cookieName: 'weval_session',
  password: process.env.SESSION_PASSWORD as string,
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
  },
};

export async function getSession(request: Request): Promise<IronSession<SessionData>> {
  const session = await unsealData<SessionData>((await cookies()).get('weval_session')?.value || '', {
    password: sessionOptions.password,
  });

  return {
    ...session,
    save: async () => {
      /* This is a read-only session for server components */
    },
    destroy: async () => {
      /* This is a read-only session for server components */
    },
    updateConfig: async () => {
        /* This is a read-only session for server components */
    }
  };
}

export { sessionOptions }; 