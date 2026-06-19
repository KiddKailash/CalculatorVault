# Calculator App with Secure Photo Vault

A React Native calculator app built with Expo that includes a hidden secure photo vault feature. The app appears as a standard calculator but provides access to a private photo storage area when the correct password equation is entered. Download the latest Android version, [here](https://expo.dev/accounts/kailashkidd/projects/Calculator/builds/72b3b3f1-48c3-4cfa-968e-2ae678c63bb8).

## Features

- **Full-featured Calculator**: Supports arithmetic operations (+, -, ×, ÷), decimal numbers, percentages, and negative numbers
- **Hidden Photo Vault**: Secure photo storage accessible via password
- **Password Protection**: Set and verify custom password sequences using calculator operations
- **Photo Management**: Import photos from camera or gallery, view in fullscreen, and delete photos
- **Cross-platform**: Runs on iOS, Android, and web

## Getting Started

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Start the development server**

   ```bash
   npx expo start
   ```

3. **Run on your preferred platform**
   - [Development build](https://docs.expo.dev/develop/development-builds/introduction/)
   - [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
   - [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
   - [Expo Go](https://expo.dev/go)

## How to Use

### Calculator Mode
- Use as a standard calculator with basic arithmetic operations
- Supports decimal numbers, percentages (%), and sign changes (±)
- Clear display with AC button

### Photo Vault Access
1. **First Launch**: Set up your password by entering a sequence of calculator operations
2. **Access Vault**: Enter your password sequence and press "=" to access the photo vault
3. **Normal Calculator**: Any other calculations work normally and display results

### Photo Vault Features
- Import photos from camera or photo library
- View photos in a grid layout
- Tap photos for fullscreen viewing
- Delete photos with confirmation dialog
- Secure storage using device permissions

## Technical Details

### Built With
- **React Native**: Cross-platform mobile development
- **Expo**: Development platform and build tools
- **Expo Router**: File-based navigation
- **AsyncStorage**: Local data persistence
- **Expo Image Picker**: Camera and photo library access
- **Expo Media Library**: Photo management
- **React Native Safe Area Context**: Safe area handling

### Key Components
- `app/index.tsx`: Main calculator interface and logic
- `src/vault/PhotoVault.tsx`: Photo vault main interface
- `src/vault/PhotoGrid.tsx`: Photo grid display
- `src/vault/PhotoViewer.tsx`: Fullscreen photo viewer
- `src/vault/ActionSheet.tsx`: Photo action menu
- `src/vault/ConfirmDialog.tsx`: Deletion confirmation

### Permissions Required
- **Camera**: Taking new photos for the vault
- **Photo Library**: Importing existing photos
- **Storage**: Reading and writing photo files

## Development

This project uses [file-based routing](https://docs.expo.dev/router/introduction) with Expo Router. The main calculator logic handles both standard calculations and password verification for vault access.

### Security Note
Photos are stored locally on the device using Expo's secure storage mechanisms. The password is stored using AsyncStorage for persistence across app sessions.
