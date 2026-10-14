# Google Search Console Verification Rule

Always ensure the user's Google Search Console verification files are present in the web application's `public/` directory and metadata:

1. **HTML Verification Files** in `public/`:
   - `google4867b014d6b90931.html` with content: `google-site-verification: google4867b014d6b90931.html`
   - `google5IL2ygi_5ddVkO4JU80nuaffteIKPWKkjHmHLkfN9Hk.html` with content: `google-site-verification: google5IL2ygi_5ddVkO4JU80nuaffteIKPWKkjHmHLkfN9Hk.html`

2. **Metadata Tag**:
   - In `app/layout.tsx`, ensure `verification: { google: 'google4867b014d6b90931' }` is present in the `metadata` export.
