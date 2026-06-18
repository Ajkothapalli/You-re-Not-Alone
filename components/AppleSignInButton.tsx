/**
 * Official Apple Sign-In button — uses the native AppleAuthenticationButton
 * component which is the only HIG-compliant option (correct logo, localized
 * text, enforced appearance). Do NOT wrap it in a container that alters its
 * appearance.
 *
 * Renders only on iOS when Sign in with Apple is available; returns null
 * otherwise so callers never need to guard the platform themselves.
 */
import * as AppleAuthentication from 'expo-apple-authentication';
import { Platform } from 'react-native';
import { radius } from '../theme/tokens';

interface Props {
  onPress: () => void;
  disabled?: boolean;
}

export default function AppleSignInButton({ onPress, disabled }: Props) {
  if (Platform.OS !== 'ios') return null;

  return (
    <AppleAuthentication.AppleAuthenticationButton
      buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
      buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
      cornerRadius={radius.pill}
      style={{ height: 52, width: '100%', opacity: disabled ? 0.4 : 1 }}
      onPress={onPress}
    />
  );
}
