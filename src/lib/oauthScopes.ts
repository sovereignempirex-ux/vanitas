// ---------------------------------------------------------------------------
// Shared metadata for the OAuth scopes Vanitas issues. Both the
// consent screen (what the USER is asked to approve) and the app
// management view (what the DEVELOPER selects at registration)
// render from this one list — they can never drift apart.
// ---------------------------------------------------------------------------

export interface OAuthScopeMeta {
  id: string;
  label: string;
  description: string;
}

export const OAUTH_SCOPE_META: OAuthScopeMeta[] = [
  {
    id: 'profile',
    label: 'Basic profile',
    description: 'Your public name, @username and avatar picture.',
  },
  {
    id: 'email',
    label: 'Email address',
    description: 'Your account email address, with an honest verified flag.',
  },
];

export function scopeMeta(id: string): OAuthScopeMeta {
  return (
    OAUTH_SCOPE_META.find((s) => s.id === id) || {
      id,
      label: id,
      description: 'Access to the requested scope.',
    }
  );
}
