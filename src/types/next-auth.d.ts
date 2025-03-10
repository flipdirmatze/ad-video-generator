import 'next-auth';
import { DefaultSession, DefaultUser } from 'next-auth';
import { JWT } from 'next-auth/jwt';
import { SubscriptionPlan, IUserLimits, IUserStats } from '@/models/User';

declare module 'next-auth' {
  /**
   * Returned by `useSession`, `getSession` and received as a prop on the `SessionProvider` React Context
   */
  interface Session extends DefaultSession {
    user: {
      /** The user's id. */
      id: string;
      /** The user's role. */
      role: string;
      /** Subscription plan (free, premium, enterprise) */
      subscriptionPlan: SubscriptionPlan;
      /** Whether the subscription is active */
      subscriptionActive: boolean;
      /** User's limits based on subscription */
      limits?: IUserLimits;
      /** User's usage statistics */
      stats?: IUserStats;
      /** Optional username */
      username?: string;
    } & DefaultSession['user'];
  }

  /**
   * The shape of the user object returned in the OAuth providers' `profile` callback,
   * or the second parameter of the `session` callback, when using a database.
   */
  interface User extends DefaultUser {
    /** The user's role. */
    role?: string;
    /** Subscription plan */
    subscriptionPlan?: SubscriptionPlan;
    /** Whether the subscription is active */
    subscriptionActive?: boolean;
    /** User's limits based on subscription */
    limits?: IUserLimits;
    /** User's usage statistics */
    stats?: IUserStats;
    /** Optional username */
    username?: string;
  }
}

declare module 'next-auth/jwt' {
  /** Returned by the `jwt` callback and `getToken`, when using JWT sessions */
  interface JWT {
    /** The user's role. */
    role?: string;
    /** The user's id. */
    id?: string;
    /** Subscription plan */
    subscriptionPlan?: SubscriptionPlan;
    /** Whether the subscription is active */
    subscriptionActive?: boolean;
    /** User's limits (simplified to avoid token size issues) */
    hasLimits?: boolean;
    /** Provider used for authentication */
    provider?: string;
  }
} 