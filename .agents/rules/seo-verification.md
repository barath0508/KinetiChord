# Account-Wide Verification & AdSense Assets

These files and configurations are identical across all projects under the user's account and must always be added to new web applications:

### 1. Google Search Console Verification
- **`public/google4867b014d6b90931.html`**:
  ```
  google-site-verification: google4867b014d6b90931.html
  ```
- **`public/google5IL2ygi_5ddVkO4JU80nuaffteIKPWKkjHmHLkfN9Hk.html`**:
  ```
  google-site-verification: google5IL2ygi_5ddVkO4JU80nuaffteIKPWKkjHmHLkfN9Hk.html
  ```
- **Metadata Tag** in `app/layout.tsx`:
  ```typescript
  verification: {
    google: 'google4867b014d6b90931',
  }
  ```

### 2. Google AdSense Authorization & Tag
- **`public/ads.txt`**:
  ```
  # Google AdSense
  google.com, pub-8825674134696584, DIRECT, f08c47fec0942fa0
  ```
- **AdSense Script Tag** in `app/layout.tsx`:
  ```tsx
  <Script
    async
    src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-8825674134696584"
    crossOrigin="anonymous"
    strategy="lazyOnload"
  />
  ```
