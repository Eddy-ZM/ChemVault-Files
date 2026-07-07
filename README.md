# ChemVault Files

ChemVault Files is the private file system for the ChemVault research workspace. It provides a secure web interface for organizing, previewing, sharing, and reviewing research files such as spectra, datasets, dossiers, methods, manuscripts, and supporting documents.

## Web Features

### Secure Sign-In

ChemVault Files uses ChemVault User sign-in for account access. Users who open the file system without an active session are sent through ChemVault SSO and returned to the file workspace after login.

### File Workspace

The main workspace presents research files in a searchable file system view. Users can browse projects and folders, switch between table and browser-style views, inspect file status, and quickly identify recently changed or review-needed items.

### Upload Management

Users with upload permission can add individual files or entire folders. Uploads appear in a queue with progress, status, and completion feedback so large research batches can be tracked without losing context.

### Folder And Project Navigation

Files can be organized by project and folder. The sidebar and browser panels support moving through the research file hierarchy, returning to the root library, and keeping the current folder context visible while reviewing contents.

### Search, Filter, And Tags

The workspace supports searching across files, folders, and tags. Quick filters help users focus on key working sets such as active uploads, review items, or shared materials.

### File Preview

Supported file types can be previewed directly in the browser, including PDFs, images, CSV/text files, and common spectroscopy text formats. Unsupported files remain available for download or metadata review.

### File Inspector

Selecting a file opens an inspector with file metadata, preview access, sharing controls, and activity history. The inspector is designed for reviewing a file without leaving the main workspace.

### Sharing

Users can create read-only share links from the file inspector. Share links can be private or public, can expire at a chosen time, and can optionally allow downloads when the creator enables download access.

### Access Control

File visibility can be managed through ChemVault roles. Administrators and authorized users can control whether files are public within the workspace or limited to selected roles.

### Activity History

Important file events are recorded in an activity timeline, including uploads, preview access, downloads, share creation, share access, and share downloads. This gives reviewers a clear history of how each file has been used.

### Account And Role Tools

The account panel shows the current ChemVault identity and available file permissions. Authorized administrators can manage role-based file access from the role settings panel.

## Website Status

ChemVault Files is available as a web application for ChemVault users. The repository also includes native Apple app source for iOS, iPadOS, and macOS, plus a Windows desktop app source that can be packaged as an installer.

## App Features

### Apple App

The Apple app provides a native SwiftUI file workspace with ChemVault sign-in, sidebar navigation, file list and grid views, file preview, upload, download, search, sorting, recycle bin access, settings, and secure session storage.

### Windows Desktop App

The Windows app provides an installable ChemVault Files desktop experience with sign-in, secure session storage, file browsing, upload, drag-and-drop upload, download, preview, new folder creation, delete and restore actions, desktop notifications, and update checking.

## License

This repository is source-available but not open source. Public visibility is for review and reference only; no rights are granted to use, copy, modify, distribute, host, deploy, or create derivative works without prior written permission from Ziwen Mu or the repository owner.

See [LICENSE](./LICENSE). All rights reserved.
