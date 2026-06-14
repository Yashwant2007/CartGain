# CartGain Media Files Guide

## How to Add Your Media Files

### Video Files
Place your video files in the `public/videos/` directory:
- **Hero Video**: `public/videos/hero-animatic.mp4`
- **Demo Video**: `public/videos/demo.mp4`
- **Testimonial Videos**: `public/videos/testimonials/`

### Images
Place your images in the `public/images/` directory:
- **Hero Image**: `public/images/hero-recovery.jpg`
- **Dashboard Screenshot**: `public/images/dashboard-analytics.jpg`
- **Conversion Flow**: `public/images/cart-recovery-flow.jpg`
- **Success Story**: `public/images/success-story.jpg`

### Usage in Code
Reference files with:
```jsx
<img src="/images/hero-recovery.jpg" alt="description" />
<video src="/videos/hero-animatic.mp4" />
```

## Files to Add
1. Copy `OIG1.hLTvBY.mp4` to `public/videos/hero-animatic.mp4`
2. Copy `cartgain_video_animatic.html` content and convert to video or use as overlay effect
3. Add the AI-generated images you created to `public/images/`

## Current Implementation
The landing page references stock images via URLs. Replace these with your custom media:
- Hero problem/solution images
- Dashboard analytics screenshot
- Conversion flow visualization
- Success story images
