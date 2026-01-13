type Theme = {
    backgroundPrimary: string;
    backgroundSecondary: string;
    textPrimary: string;
    textPrimaryName: string;
    textSecondary: string;
    borderPrimary: string;
    borderSecondary: string;
}

export const Themes: Record<string, Theme> = {
    dark: {
        backgroundPrimary: '#1f363d',
        backgroundSecondary: '#1a2e33',
        textPrimary: '#a5c496',
        textPrimaryName: 'teaGreen',
        textSecondary: '#d1d5db',
        borderPrimary: '#d1d5db',
        borderSecondary: '#d1d5db',
    },
    light: {
        backgroundPrimary: '#f1f5f9',
        backgroundSecondary: '#f1f5f9',
        textPrimary: '#1a2e33',
        textPrimaryName: 'teaGreen',
        textSecondary: '#d1d5db',
        borderPrimary: '#d1d5db',
        borderSecondary: '#d1d5db',
    },
}