import React from "react";
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { C, R } from "../theme";
import { getProviders } from "../engine/engine";
import { setProvider, useApp } from "../state/store";
import { useAsync } from "../lib/useAsync";
import { ErrorBox, Loading } from "./ui";

export function ProviderSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const cur = useApp((s) => s.provider);
  const { data, error, loading, reload } = useAsync(getProviders, [], visible);
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={st.backdrop} onPress={onClose} />
      <View style={st.sheet}>
        <View style={st.grab} />
        <Text style={st.title}>Choose provider</Text>
        {loading && !data ? <Loading /> : error && !data ? <ErrorBox text={error} onRetry={reload} /> : (
          <FlatList data={data} keyExtractor={(p) => p.value} contentContainerStyle={{ paddingBottom: 30 }}
            renderItem={({ item }) => (
              <Pressable style={st.row} onPress={() => { setProvider(item.value); onClose(); }}>
                {item.icon ? <Image source={{ uri: item.icon }} style={st.icon} contentFit="cover" /> : <View style={st.icon} />}
                <Text style={st.name}>{item.name}</Text>
                {item.value === cur ? <Ionicons name="checkmark-circle" size={22} color={C.accent} /> : null}
              </Pressable>
            )} />
        )}
      </View>
    </Modal>
  );
}
const st = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,.6)" },
  sheet: { backgroundColor: C.card, borderTopLeftRadius: 22, borderTopRightRadius: 22, maxHeight: "75%", minHeight: 280, paddingHorizontal: 16 },
  grab: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: C.line, marginTop: 8 },
  title: { color: C.text, fontSize: 18, fontWeight: "800", marginVertical: 14 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  icon: { width: 38, height: 38, borderRadius: R.s, backgroundColor: C.card2 },
  name: { color: C.text, fontSize: 15, flex: 1 },
});
