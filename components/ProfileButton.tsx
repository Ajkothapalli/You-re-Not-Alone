/**
 * ProfileButton — the global top-left avatar. Shows the user's own
 * character (profile-only, device-local) and opens /profile.
 * Re-reads the profile on focus so a character change reflects
 * immediately when navigating back.
 */

import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import { Animated, Pressable } from 'react-native';
import { getPersonaById, PersonaBadge, type Persona } from './Persona';
import { getProfile } from '../lib/profile';

export default function ProfileButton() {
  const [persona, setPersona] = useState<Persona | null>(null);
  const press = useRef(new Animated.Value(0)).current;

  useFocusEffect(
    useCallback(() => {
      let live = true;
      getProfile().then((p) => {
        if (live) setPersona(getPersonaById(p.personaId));
      });
      return () => { live = false; };
    }, []),
  );

  if (!persona) return null;

  return (
    <Pressable
      onPress={() => router.push('/profile')}
      onPressIn={() =>
        Animated.timing(press, { toValue: 1, duration: 80, useNativeDriver: true }).start()
      }
      onPressOut={() =>
        Animated.spring(press, { toValue: 0, speed: 22, bounciness: 8, useNativeDriver: true }).start()
      }
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel="Your profile"
      accessibilityHint="Opens your character, name, and account settings"
    >
      <Animated.View
        style={{
          transform: [{ scale: press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.9] }) }],
        }}
      >
        <PersonaBadge persona={persona} size={36} showName={false} />
      </Animated.View>
    </Pressable>
  );
}
