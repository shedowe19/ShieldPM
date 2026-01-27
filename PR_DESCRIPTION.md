# Feature: Custom Profile Pictures

## Overview
This PR introduces the ability for users to customize their profile pictures. Previously, ShieldPM only supported Gravatar. Now, users can choose between:
1.  **Gravatar** (Default)
2.  **Custom URL** (External image link)
3.  **Upload** (Local file upload, stored in `/data/avatars`)

## Changes

### Backend
- **Database**: Added `avatar_type` and `avatar_value` columns to `user` table (Migration: `2026/01/27`).
- **API**:
    - `POST /api/users/:id/avatar`: Endpoint for uploading avatar images (max 2MB).
    - `GET /api/users/:id/avatar/image`: Endpoint for serving uploaded avatars.
    - Updated `PUT /api/users/:id` to handle avatar type switching.
    - **Security**: Applied rate limiting (100 req/min) to avatar image serving endpoint.
- **Logic**: Implemented file serving and upload handling in `internal/user.js`.

### Frontend
- **UI**: 
    - Updated `UserModal` to include a new **Profile Picture** tab.
    - Added a live preview of the avatar.
    - Added a source selector (Gravatar / Custom URL / Upload).
- **Components**:
    - Renamed `GravatarFormatter` to `UserAvatar`.
    - Updated `UserAvatar` to correctly render images from all sources.
- **Refactoring**:
    - Identified and refactored legacy string unions to `as const` enums (e.g., `AVATAR_TYPE`) to improve type safety.

## Data Path
Uploaded avatars are stored in the `/data/avatars` directory. This ensures they persist alongside other data.

## Verification
- [x] **Gravatar**: Confirmed default behavior works for existing and new users.
- [x] **Custom URL**: Confirmed external URLs are saved and rendered correctly.
- [x] **Upload**: Confirmed images (PNG, JPG) can be uploaded, stored, and served.
- [x] **Persistence**: Confirmed settings remain after page reload and container restart.
