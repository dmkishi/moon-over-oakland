Bluesky Limits
================================================================================

Sources:
- [`app.bsky.embed.images` Lexicon](https://github.com/bluesky-social/atproto/blob/main/packages/api/lexicons/app/bsky/embed/images.json)
- [Every Bluesky limit in 2026: posts, images, video, bio and DMs](https://opentweet.io/answers/bluesky-limits)

Profile
--------------------------------------------------------------------------------
- **Bio/description**: 256 graphemes
- **Avatar**: 1 MB

Post
--------------------------------------------------------------------------------
- **Content**: 300 graphemes
- **Images**:
  - **Max count**: 4 per post
  - **Max size**: 2 MB
  - **No dimension limit**. None. However, the Bluesky app tops out at 4000 ×
    4000 px.
  - `alt` is required (empty string is allowed.)
  - `aspectRatio` is optional.
- **Video**: 1 per post, 300 MB, 10 minutes
