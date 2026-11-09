// `@expo/metro-runtime` MUST be the first import (Fast Refresh on web)
import "@expo/metro-runtime";
import { renderRootComponent } from "expo-router/build/renderRootComponent";
import Boot from "./src/boot";

renderRootComponent(Boot);
