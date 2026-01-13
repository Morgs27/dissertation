import { Themes } from "@/config/Colours";
import { useState } from "react";

export const useTheme = () => {
    const [currentTheme, setCurrentTheme] = useState('dark');

    const theme = Themes[currentTheme];

    return { theme, currentTheme, setCurrentTheme };
}