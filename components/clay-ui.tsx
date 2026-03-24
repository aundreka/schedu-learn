import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { ReactNode, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Clay, Colors, Fonts } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

type ClayScreenProps = {
  greeting?: string;
  title: string;
  subtitle?: string;
  avatarLabel?: string;
  onAvatarPress?: () => void;
  onRefresh?: () => Promise<void>;
  children: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
};

type SectionHeaderProps = {
  icon: keyof typeof MaterialIcons.glyphMap;
  title: string;
  accessory?: ReactNode;
};

type StatCardProps = {
  label: string;
  value: string;
  onPress?: () => void;
};

export function ClayScreen({
  greeting,
  title,
  subtitle,
  avatarLabel,
  onAvatarPress,
  onRefresh,
  children,
  contentStyle,
}: ClayScreenProps) {
  const colorScheme = useColorScheme() ?? 'light';
  const palette = Colors[colorScheme];
  const insets = useSafeAreaInsets();
  const headerTopPadding = Math.max(insets.top + 12, 24);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    if (!onRefresh) {
      return;
    }

    try {
      setRefreshing(true);
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: palette.background }]}>
      <View style={[styles.blob, styles.blobOne, { backgroundColor: 'rgba(201,184,255,0.5)' }]} />
      <View style={[styles.blob, styles.blobTwo, { backgroundColor: 'rgba(255,184,217,0.35)' }]} />
      <View style={[styles.blob, styles.blobThree, { backgroundColor: 'rgba(255,207,134,0.28)' }]} />
      <ScrollView
        contentContainerStyle={[styles.content, contentStyle]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={palette.tint} /> : undefined
        }>
        <View style={[styles.header, { paddingTop: headerTopPadding }]}> 
          <View style={styles.headerCopy}>
            {greeting ? (
              <View style={styles.greetingRow}>
                <MaterialIcons name="wb-sunny" size={14} color={palette.icon} />
                <ThemedText style={[styles.greeting, { color: palette.icon }]}>{greeting}</ThemedText>
              </View>
            ) : null}
            <ThemedText style={styles.title}>{title}</ThemedText>
            {subtitle ? <ThemedText style={[styles.subtitle, { color: palette.icon }]}>{subtitle}</ThemedText> : null}
          </View>
          {avatarLabel ? (
            <Pressable onPress={onAvatarPress} style={styles.avatar}>
              <ThemedText style={styles.avatarLabel}>{avatarLabel}</ThemedText>
            </Pressable>
          ) : null}
        </View>
        {children}
      </ScrollView>
    </View>
  );
}

export function ClaySectionHeader({ icon, title, accessory }: SectionHeaderProps) {
  const palette = Colors[useColorScheme() ?? 'light'];

  return (
    <View style={styles.sectionRow}>
      <View style={styles.sectionLabelRow}>
        <MaterialIcons name={icon} size={14} color={palette.icon} />
        <ThemedText style={[styles.sectionTitle, { color: palette.icon }]}>{title}</ThemedText>
      </View>
      {accessory}
    </View>
  );
}

export function ClayCard({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function ClayPill({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.pill, style]}>{children}</View>;
}

export function ClayStatCard({ label, value, onPress }: StatCardProps) {
  const body = (
    <View style={styles.statCardInner}>
      <ThemedText style={styles.statLabel}>{label}</ThemedText>
      <ThemedText style={styles.statValue}>{value}</ThemedText>
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} style={styles.statCard}>
        {body}
      </Pressable>
    );
  }

  return <View style={styles.statCard}>{body}</View>;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  blob: {
    position: 'absolute',
    borderRadius: 999,
  },
  blobOne: {
    width: 360,
    height: 360,
    top: -90,
    right: -80,
  },
  blobTwo: {
    width: 260,
    height: 260,
    bottom: 180,
    left: -70,
  },
  blobThree: {
    width: 220,
    height: 220,
    bottom: -30,
    right: 50,
  },
  content: {
    padding: 20,
    paddingBottom: 120,
    gap: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  headerCopy: {
    flex: 1,
    gap: 4,
  },
  greetingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  greeting: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  title: {
    fontFamily: Fonts.rounded,
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '900',
    color: '#2D2250',
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 18,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    ...Clay.shadow,
  },
  avatarLabel: {
    fontFamily: Fonts.rounded,
    fontSize: 16,
    fontWeight: '900',
    color: '#7A55B0',
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  sectionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 16,
    ...Clay.deepShadow,
  },
  pill: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
    ...Clay.shadow,
  },
  statCard: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.8)',
    borderRadius: 22,
    ...Clay.shadow,
  },
  statCardInner: {
    padding: 16,
    gap: 8,
  },
  statLabel: {
    fontSize: 12,
    color: '#6B5B8A',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontWeight: '800',
  },
  statValue: {
    fontFamily: Fonts.rounded,
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '900',
    color: '#2D2250',
  },
});
