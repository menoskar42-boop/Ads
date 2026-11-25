import { useAuth } from "@clerk/expo";
import { Image } from "expo-image";
import { useEffect, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { apiUrl } from "../lib/api";
import { initials } from "../lib/format";
import { colors } from "../lib/theme";

export function Avatar({
  name,
  uri,
  size = 52,
  online = false,
}: {
  name: string;
  uri?: string | null;
  size?: number;
  online?: boolean;
}) {
  const { getToken } = useAuth();
  const [imageSource, setImageSource] = useState<{
    uri: string;
    headers?: Record<string, string>;
  } | null>(null);

  useEffect(() => {
    let active = true;
    let objectUrl = "";
    setImageSource(null);
    if (!uri) return () => { active = false; };

    void (async () => {
      try {
        const token = await getToken();
        if (!active) return;
        if (Platform.OS === "web") {
          const response = await fetch(apiUrl(uri), {
            credentials: "include",
            ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
          });
          if (!response.ok) return;
          objectUrl = URL.createObjectURL(await response.blob());
          if (active) setImageSource({ uri: objectUrl });
          else URL.revokeObjectURL(objectUrl);
          return;
        }
        if (token) {
          setImageSource({
            uri: apiUrl(uri),
            headers: { Authorization: `Bearer ${token}` },
          });
        }
      } catch {
        if (active) setImageSource(null);
      }
    })();

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [getToken, uri]);

  return (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      {imageSource ? (
        <Image
          source={imageSource}
          style={[styles.image, { width: size, height: size, borderRadius: size / 2 }]}
          contentFit="cover"
          cachePolicy="memory-disk"
          onError={() => setImageSource(null)}
        />
      ) : (
        <Text style={[styles.initial, { fontSize: size * 0.34 }]}>{initials(name)}</Text>
      )}
      {online && <View style={styles.online} />}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    backgroundColor: colors.blueDark,
    borderWidth: 1,
    borderColor: "#427BAF",
  },
  image: { position: "absolute", top: 0, left: 0 },
  initial: { color: colors.text, fontWeight: "800" },
  online: {
    position: "absolute",
    width: 12,
    height: 12,
    borderRadius: 6,
    bottom: 0,
    right: 0,
    backgroundColor: colors.green,
    borderWidth: 2,
    borderColor: colors.background,
  },
});
