/**
 * Character Style Customizer for SillyTavern
 * Provides improved UI, animations, and CSS customization
 * @version 1.0.0
 */

//#region ST imports
import { eventSource, event_types, saveSettingsDebounced } from "../../../../script.js";
import { extension_settings } from "../../../extensions.js";
import { getContext } from "../../../extensions.js";
import { power_user } from "../../../power-user.js";

import { EventEmitter } from "../../../../lib/eventemitter.js";
import {
    setupMessageObserver,
    addAuthorUidToMessage,
    processAllMessages,
    cssEventSource,
    css_event_type,
    CharacterType,
    getCurrentEditingCharacterInfo
} from './uid-injector.js';

// Import fullscreen editor functionality
import { initFullScreenEditor, createCssHelpSection } from './css-editor.js';

// Extension identifier and settings
const EXTENSION_NAME = 'SillyTavern-CharStyleCustomizer';
const EXTENSION_VERSION = '1.0.0';
const settingsKey = 'charStyleCustomizer';

// Create custom event emitter for persona changes
export const exp_event_source = new EventEmitter();
export const exp_event_type = {
    PERSONA_CHANGED: "persona_changed",
};

// Default settings
const defaultSettings = {
    enabled: true,
    enableCharacterCSS: true,  // Toggle for character-specific message CSS
    enableGlobalCSS: false,    // Toggle for global CSS (off by default for safety)
    globalSettings: {
        mainColors: {
            primary: '#51A0DE',    // Main accent color
            secondary: '#FFFFFF',  // Secondary accent color
            bgPrimary: '#1E1E1E',  // Main background color
            bgSecondary: '#333333' // Secondary background color
        },
        // Default mapping of main colors to elements
        colorMapping: {
            characterName: 'primary',
            mainText: 'neutral',
            quotes: 'secondary',
            bold: 'neutral',
            italic: 'neutral',
            boldItalic: 'primary',
            underline: 'secondary',
            strikethrough: 'secondary',
            blockquoteBorder: 'primary',
            links: 'primary',
            linksHover: 'secondary'
        }
    },
    userSettings: {
        mainColors: {
            primary: '#51A0DE',    // User primary color
            secondary: '#FFFFFF',  // User secondary color
            bgPrimary: '#1E1E1E',  // User background color
            bgSecondary: '#333333' // User secondary background color
        }
    },
    characterSettings: {}
};

let settings = {};
let mainStyleElement;
let previewStyleElement;
let globalCssElement;

// Initialize the extension settings
function initializeSettings() {
    if (!extension_settings[settingsKey]) {
        extension_settings[settingsKey] = {};
    }

    // Ensure all default settings exist
    for (const key in defaultSettings) {
        if (extension_settings[settingsKey][key] === undefined) {
            extension_settings[settingsKey][key] = defaultSettings[key];
        }
    }

    // Initialize CSS toggle settings
    if (extension_settings[settingsKey].enableCharacterCSS === undefined) {
        extension_settings[settingsKey].enableCharacterCSS = defaultSettings.enableCharacterCSS;
    }

    if (extension_settings[settingsKey].enableGlobalCSS === undefined) {
        extension_settings[settingsKey].enableGlobalCSS = defaultSettings.enableGlobalCSS;
    }

    // Ensure global settings exist
    if (!extension_settings[settingsKey].globalSettings) {
        extension_settings[settingsKey].globalSettings = defaultSettings.globalSettings;
    }

    // Ensure main colors exist
    if (!extension_settings[settingsKey].globalSettings.mainColors) {
        extension_settings[settingsKey].globalSettings.mainColors = defaultSettings.globalSettings.mainColors;
    }

    // Ensure all main colors exist
    for (const key in defaultSettings.globalSettings.mainColors) {
        if (extension_settings[settingsKey].globalSettings.mainColors[key] === undefined) {
            extension_settings[settingsKey].globalSettings.mainColors[key] = defaultSettings.globalSettings.mainColors[key];
        }
    }

    // Ensure color mapping exists
    if (!extension_settings[settingsKey].globalSettings.colorMapping) {
        extension_settings[settingsKey].globalSettings.colorMapping = defaultSettings.globalSettings.colorMapping;
    }

    // Ensure all color mappings exist
    for (const key in defaultSettings.globalSettings.colorMapping) {
        if (extension_settings[settingsKey].globalSettings.colorMapping[key] === undefined) {
            extension_settings[settingsKey].globalSettings.colorMapping[key] = defaultSettings.globalSettings.colorMapping[key];
        }
    }

    // Ensure user settings exist
    if (!extension_settings[settingsKey].userSettings) {
        extension_settings[settingsKey].userSettings = defaultSettings.userSettings;
    }

    // Ensure user main colors exist
    if (!extension_settings[settingsKey].userSettings.mainColors) {
        extension_settings[settingsKey].userSettings.mainColors = defaultSettings.userSettings.mainColors;
    }

    // Ensure all user main colors exist
    for (const key in defaultSettings.userSettings.mainColors) {
        if (extension_settings[settingsKey].userSettings.mainColors[key] === undefined) {
            extension_settings[settingsKey].userSettings.mainColors[key] = defaultSettings.userSettings.mainColors[key];
        }
    }

    // Ensure character settings exist
    if (!extension_settings[settingsKey].characterSettings) {
        extension_settings[settingsKey].characterSettings = {};
    }

    // Update character settings structure for all existing characters
    for (const charId in extension_settings[settingsKey].characterSettings) {
        const charSettings = extension_settings[settingsKey].characterSettings[charId];

        // Initialize character CSS fields if they don't exist
        if (charSettings.customCSS === undefined) {
            charSettings.customCSS = '';
        }

        // Add globalCSS field if it doesn't exist
        if (charSettings.globalCSS === undefined) {
            charSettings.globalCSS = '';
        }

        // Add enableGlobalCSS field if it doesn't exist
        if (charSettings.enableGlobalCSS === undefined) {
            charSettings.enableGlobalCSS = true;
        }
    }

    return extension_settings[settingsKey];
}

// Initialize settings
settings = initializeSettings();

// Get the current chat character
function getCurrentCharacter() {
    const stContext = getContext();
    const currCharIndex = stContext.characterId;
    if (!currCharIndex)
        return null;

    const currCharAvatar = stContext.characters[currCharIndex].avatar;
    const currCharName = stContext.characters[currCharIndex].name;

    // Clean up the name
    const cleanedName = currCharName.replace(/\.[^/.]+$/, "");

    return {
        id: `${CharacterType.CHARACTER}|${cleanedName}|${currCharAvatar}`,
        name: cleanedName,
        avatar: currCharAvatar
    };
}

// Get the user's currently selected persona
function getCurrentPersona() {
    let avatarId = '';
    let userName = 'User';

    try {
        const avatarElement = document.querySelector('#user_avatar_block .avatar-container.selected');
        const nameElement = document.getElementById('your_name');

        if (avatarElement) {
            avatarId = avatarElement.getAttribute('data-avatar-id') || '';
            console.log(`[CSC] Found user avatar: ${avatarId}`);
        } else {
            avatarId = power_user.user_avatar;
            console.log(`[CSC] Using fallback user avatar: ${avatarId}`);
        }

        if (nameElement) {
            userName = nameElement.textContent.trim();
            console.log(`[CSC] Found user name: ${userName}`);
        } else {
            userName = power_user.personas[power_user.user_avatar] || 'User';
            console.log(`[CSC] Using fallback user name: ${userName}`);
        }
    } catch (error) {
        console.error('[CSC] Error getting persona:', error);
        avatarId = power_user.user_avatar;
        userName = power_user.personas[power_user.user_avatar] || 'User';
    }

    const personaId = `${CharacterType.PERSONA}|${userName}|${avatarId}`;
    console.log(`[CSC] Current persona ID: ${personaId}`);

    return {
        id: personaId,
        name: userName,
        avatar: avatarId
    };
}

// Load external stylesheet
function loadStylesheet() {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.type = 'text/css';
    link.href = 'extensions/third-party/SillyTavern-CharStyleCustomizer/styles.css';
    link.id = 'char-style-customizer-css';
    document.head.appendChild(link);
}

// Initialize style sheets
function initializeStyleSheets() {
    // Load external stylesheet
    loadStylesheet();

    // Create main style element
    mainStyleElement = document.createElement('style');
    mainStyleElement.id = 'char-style-main';
    document.head.appendChild(mainStyleElement);

    // Create preview style element
    previewStyleElement = document.createElement('style');
    previewStyleElement.id = 'char-style-preview';
    document.head.appendChild(previewStyleElement);

    // Create global CSS style element
    globalCssElement = document.createElement('style');
    globalCssElement.id = 'char-style-global-css';
    document.head.appendChild(globalCssElement);
}

// Get main colors configuration
function getMainColorConfig(context = 'global') {
    const configs = {
        global: [
            { id: 'main-color-primary', key: 'primary', label: 'Primary Color', description: 'var(--csc-primary)', advanced: false },
            { id: 'main-color-secondary', key: 'secondary', label: 'Secondary Color', description: 'var(--csc-secondary)', advanced: false },
            { id: 'main-color-bg-primary', key: 'bgPrimary', label: 'Primary Background', description: 'var(--csc-bg-primary)', advanced: true },
            { id: 'main-color-bg-secondary', key: 'bgSecondary', label: 'Secondary Background', description: 'var(--csc-bg-secondary)', advanced: true }
        ],
        user: [
            { id: 'main-color-primary', key: 'primary', label: 'Primary Color', description: 'var(--csc-user-primary)', advanced: false },
            { id: 'main-color-secondary', key: 'secondary', label: 'Secondary Color', description: 'var(--csc-user-secondary)', advanced: false },
            { id: 'main-color-bg-primary', key: 'bgPrimary', label: 'Primary Background', description: 'var(--csc-user-bg-primary)', advanced: true },
            { id: 'main-color-bg-secondary', key: 'bgSecondary', label: 'Secondary Background', description: 'var(--csc-user-bg-secondary)', advanced: true }
        ],
        character: [
            { id: 'main-color-primary', key: 'primary', label: 'Primary Color', description: 'var(--csc-char-primary)', advanced: false },
            { id: 'main-color-secondary', key: 'secondary', label: 'Secondary Color', description: 'var(--csc-char-secondary)', advanced: false },
            { id: 'main-color-bg-primary', key: 'bgPrimary', label: 'Primary Background', description: 'var(--csc-char-bg-primary)', advanced: true },
            { id: 'main-color-bg-secondary', key: 'bgSecondary', label: 'Secondary Background', description: 'var(--csc-char-bg-secondary)', advanced: true }
        ],
        persona: [
            { id: 'main-color-primary', key: 'primary', label: 'Primary Color', description: 'var(--csc-persona-primary)', advanced: false },
            { id: 'main-color-secondary', key: 'secondary', label: 'Secondary Color', description: 'var(--csc-persona-secondary)', advanced: false },
            { id: 'main-color-bg-primary', key: 'bgPrimary', label: 'Primary Background', description: 'var(--csc-persona-bg-primary)', advanced: true },
            { id: 'main-color-bg-secondary', key: 'bgSecondary', label: 'Secondary Background', description: 'var(--csc-persona-bg-secondary)', advanced: true }
        ]
    };

    return configs[context] || configs.global;
}

// Get color element mapping configuration
function getColorMappingConfig() {
    return [
        { id: 'map-character-name', key: 'characterName', label: 'Character Name', description: '.name_text' },
        { id: 'map-main-text', key: 'mainText', label: 'Main Text', description: '.mes_text' },
        { id: 'map-quotes', key: 'quotes', label: 'Quotes', description: '.mes_text q' },
        { id: 'map-bold', key: 'bold', label: 'Bold Text', description: '.mes_text b, .mes_text strong' },
        { id: 'map-italic', key: 'italic', label: 'Italic Text', description: '.mes_text i, .mes_text em' },
        { id: 'map-bold-italic', key: 'boldItalic', label: 'Bold+Italic Text', description: '.mes_text b i, .mes_text strong em,\n.mes_text i b, .mes_text em strong', advanced: true },
        { id: 'map-underline', key: 'underline', label: 'Underline Text', description: '.mes_text u', advanced: true },
        { id: 'map-strikethrough', key: 'strikethrough', label: 'Strikethrough', description: '.mes_text s, .mes_text strike,\n.mes_text del', advanced: true },
        { id: 'map-blockquote-border', key: 'blockquoteBorder', label: 'Blockquote Border', description: '.mes_text blockquote' },
        { id: 'map-links', key: 'links', label: 'Links', description: '.mes_text a' },
        { id: 'map-links-hover', key: 'linksHover', label: 'Links (Hover)', description: '.mes_text a:hover' }
    ];
}

// Convert any color format to hex
function convertToHexColor(color) {
    // If color is empty, return empty string
    if (!color) {
        return '';
    }

    // If already a hex color with # prefix, return as is
    if (/^#([0-9A-F]{3}){1,2}$/i.test(color)) {
        return color;
    }

    // For other formats (rgb, rgba, etc.), create a temp element to convert
    const tempElem = document.createElement('div');
    tempElem.style.color = color;
    document.body.appendChild(tempElem);
    const computedColor = getComputedStyle(tempElem).color;
    document.body.removeChild(tempElem);

    // Convert rgb/rgba to hex
    const rgbMatch = computedColor.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)$/i);
    if (rgbMatch) {
        const r = parseInt(rgbMatch[1], 10).toString(16).padStart(2, '0');
        const g = parseInt(rgbMatch[2], 10).toString(16).padStart(2, '0');
        const b = parseInt(rgbMatch[3], 10).toString(16).padStart(2, '0');
        return `#${r}${g}${b}`.toUpperCase();
    }

    // If conversion failed, return a default color
    return '#FFFFFF';
}

// Modified color picker function
function createSimpleColorPicker(initialColor, onChange, id) {
    // Ensure initial color is in hex format
    const hexColor = initialColor ? convertToHexColor(initialColor) : '';
    console.log(`[CSC] Creating color picker ${id} with initial color: "${initialColor}" -> "${hexColor}"`);

    // Create container
    const container = document.createElement('div');
    container.className = 'simple-color-picker';
    container.style.position = 'relative';

    // Create color preview element wrapper
    const previewWrapper = document.createElement('div');
    previewWrapper.style.position = 'relative';
    previewWrapper.style.display = 'inline-block';

    // Create color preview element
    const colorPreview = document.createElement('div');
    colorPreview.className = 'color-preview';
    colorPreview.id = `${id}-preview`;
    colorPreview.style.backgroundColor = hexColor || 'transparent';

    // Create color input, positioned correctly but invisible
    const hiddenInput = document.createElement('input');
    hiddenInput.type = 'color';
    hiddenInput.id = `${id}-picker`;
    hiddenInput.value = hexColor || '#FFFFFF';
    hiddenInput.style.position = 'absolute';
    hiddenInput.style.left = '0';
    hiddenInput.style.top = '0';
    hiddenInput.style.width = '100%';
    hiddenInput.style.height = '100%';
    hiddenInput.style.opacity = '0';
    hiddenInput.style.cursor = 'pointer';

    // Create text input for hex code
    const textInput = document.createElement('input');
    textInput.type = 'text';
    textInput.className = 'color-input';
    textInput.id = `${id}-text`;
    textInput.value = hexColor;
    textInput.placeholder = '#RRGGBB';

    // Add empty indicator (if no color)
    if (!hexColor) {
        colorPreview.classList.add('empty-color');
        colorPreview.innerHTML = '<i class="fa-solid fa-eye-slash" style="font-size: 10px; opacity: 0.5;"></i>';
        // Ensure icon is above color input
        colorPreview.style.position = 'relative';
        colorPreview.querySelector('i').style.position = 'relative';
        colorPreview.querySelector('i').style.zIndex = '2';
    }

    // Add event listeners
    hiddenInput.addEventListener('input', (e) => {
        const newColor = e.target.value.toUpperCase();
        console.log(`[CSC] Hidden input changed for ${id}: "${newColor}"`);
        colorPreview.style.backgroundColor = newColor;
        textInput.value = newColor;
        colorPreview.classList.remove('empty-color');
        colorPreview.innerHTML = '';

        // Call onChange callback and trigger real-time update
        if (onChange) {
            onChange(newColor);
            // Immediately update style to show effect
            if (window.lastSelectedCharacterId) {
                updatePreviewStyle(window.lastSelectedCharacterId);
            }
            // For global color changes, also update main style
            if (id.startsWith('main-color-') || id.startsWith('map-')) {
                updateMainStyle();
                processAllMessages(); // Reprocess all messages to apply new styles
            }
        }
    });

    textInput.addEventListener('input', (e) => {
        let newColor = e.target.value;
        console.log(`[CSC] Text input changed for ${id}: "${newColor}"`);

        // If input is empty, treat as "no color"
        if (!newColor) {
            colorPreview.style.backgroundColor = 'transparent';
            colorPreview.classList.add('empty-color');
            colorPreview.innerHTML = '<i class="fa-solid fa-eye-slash" style="font-size: 10px; opacity: 0.5;"></i>';

            // Call onChange callback and trigger real-time update
            if (onChange) {
                onChange('');
                // Immediately update style to show effect
                if (window.lastSelectedCharacterId) {
                    updatePreviewStyle(window.lastSelectedCharacterId);
                }
                // For global color changes, also update main style
                if (id.startsWith('main-color-') || id.startsWith('map-')) {
                    updateMainStyle();
                    processAllMessages(); // Reprocess all messages to apply new styles
                }
            }
            return;
        }

        // Try to validate/format color input
        if (newColor.match(/^#?([0-9A-F]{3}|[0-9A-F]{6})$/i)) {
            // Ensure # prefix
            if (!newColor.startsWith('#')) {
                newColor = '#' + newColor;
                textInput.value = newColor.toUpperCase();
            } else {
                textInput.value = newColor.toUpperCase();
            }

            // Update color preview and hidden input
            colorPreview.style.backgroundColor = newColor;
            colorPreview.classList.remove('empty-color');
            colorPreview.innerHTML = '';
            hiddenInput.value = newColor;

            // Call onChange callback and trigger real-time update
            if (onChange) {
                onChange(newColor);
                // Immediately update style to show effect
                if (window.lastSelectedCharacterId) {
                    updatePreviewStyle(window.lastSelectedCharacterId);
                }
                // For global color changes, also update main style
                if (id.startsWith('main-color-') || id.startsWith('map-')) {
                    updateMainStyle();
                    processAllMessages(); // Reprocess all messages to apply new styles
                }
            }
        }
    });

    // Assemble picker
    previewWrapper.appendChild(colorPreview);
    previewWrapper.appendChild(hiddenInput);
    container.appendChild(previewWrapper);
    container.appendChild(textInput);

    return container;
}

// Create a color item UI element
function createColorItem(config, savedColor, onChange) {
    const colorItem = document.createElement('div');
    colorItem.className = 'cs-style-color-item';

    if (config.advanced) {
        colorItem.classList.add('cs-style-advanced-item');
        colorItem.style.display = 'none';
    }

    // Create label
    const label = document.createElement('label');
    label.className = 'cs-style-color-label';
    label.textContent = config.label;

    // Create description
    const description = document.createElement('span');
    description.className = 'cs-style-color-description';
    description.style.whiteSpace = 'pre-wrap';
    description.textContent = config.description;

    // Create color row
    const colorRow = document.createElement('div');
    colorRow.className = 'cs-style-color-row';

    // Create color picker
    const picker = createSimpleColorPicker(savedColor, onChange, config.id);

    // Assemble the UI
    colorRow.appendChild(picker);

    // Add components in the order for grid layout
    colorItem.appendChild(colorRow);
    colorItem.appendChild(label);
    colorItem.appendChild(description);

    return colorItem;
}

// Create collapsible advanced section
function createAdvancedSection(advancedItems) {
    const advancedSection = document.createElement('div');
    advancedSection.className = 'cs-style-advanced-settings';

    const advancedToggle = document.createElement('div');
    advancedToggle.className = 'cs-style-advanced-toggle';
    advancedToggle.innerHTML = '<span>Advanced Options</span><i class="fa-solid fa-chevron-down"></i>';

    const advancedContent = document.createElement('div');
    advancedContent.className = 'cs-style-advanced-content';

    // Move advanced items into the advanced section
    advancedItems.forEach(item => {
        item.style.display = '';
        advancedContent.appendChild(item);
    });

    // Setup toggle behavior
    advancedToggle.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent triggering parent collapsible

        advancedContent.classList.toggle('expanded');
        const icon = advancedToggle.querySelector('i');
        icon.className = advancedContent.classList.contains('expanded')
            ? 'fa-solid fa-chevron-up'
            : 'fa-solid fa-chevron-down';
    });

    advancedSection.appendChild(advancedToggle);
    advancedSection.appendChild(advancedContent);

    return advancedSection;
}

// Create CSS field with info message
function createCssFieldWithInfo(id, placeholder, infoText) {
    const container = document.createElement('div');
    container.className = 'cs-style-css-field-container';

    // Create textarea
    const textarea = document.createElement('textarea');
    textarea.id = id;
    textarea.className = 'text_pole';
    textarea.placeholder = placeholder;
    textarea.rows = 5;

    // Create info message
    const infoMessage = document.createElement('div');
    infoMessage.className = 'cs-style-css-info';
    infoMessage.innerHTML = infoText;

    container.appendChild(textarea);
    container.appendChild(infoMessage);

    return container;
}

// Export character style settings to a JSON file
function exportCharacterStyle(characterId) {
    // Check if character exists in settings
    if (!settings.characterSettings[characterId]) {
        toastr.error('No style settings found for this character');
        return;
    }

    // Get character name from ID (format: TYPE|NAME|AVATAR)
    let characterName = 'Character';

    if (characterId.includes('|')) {
        const parts = characterId.split('|');
        characterName = parts[1] || 'Character';
    }

    // Create export data with CSC identifier
    const exportData = {
        version: EXTENSION_VERSION,
        type: "CharStyleCustomizer",
        name: characterName,
        timestamp: new Date().toISOString(),
        settings: settings.characterSettings[characterId]
    };

    // Convert to JSON string
    const jsonString = JSON.stringify(exportData, null, 2);

    // Create filename with [CSC] prefix as requested
    const filename = `[CSC] ${characterName}.json`;

    // Create download link
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;

    // Trigger download
    document.body.appendChild(a);
    a.click();

    // Clean up
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toastr.success(`Style settings exported for ${characterName}`);
}

// Import style settings from a JSON file to the current character
function importCharacterStyle(files) {
    if (!files || !files.length) {
        toastr.error('No file selected');
        return;
    }

    const file = files[0];

    // Check if file is JSON
    if (!file.name.endsWith('.json')) {
        toastr.error('Only JSON files are supported');
        return;
    }

    const reader = new FileReader();

    reader.onload = function(e) {
        try {
            // Parse the JSON data
            const importData = JSON.parse(e.target.result);

            // Check if this is a CSC file
            if (!importData.settings) {
                toastr.error('Not a valid Character Style Customizer file');
                return;
            }

            // Get current character or editing character
            let targetCharInfo;

            // First try to get the character being edited (if in card view)
            targetCharInfo = getCurrentEditingCharacterInfo();

            // If not in card view, try to get selected character from dropdown
            if (!targetCharInfo || !targetCharInfo.id) {
                const select = document.getElementById('cs-style-character-select');
                if (select && select.value) {
                    targetCharInfo = { id: select.value };
                } else {
                    // Try getting current chat character
                    targetCharInfo = getCurrentCharacter();
                    if (!targetCharInfo || !targetCharInfo.id) {
                        // Check if we're in persona settings
                        const persona = getCurrentPersona();
                        if (persona && persona.id) {
                            targetCharInfo = persona;
                        } else {
                            toastr.warning('Please select a character first');
                            return;
                        }
                    }
                }
            }

            showConfirmationDialog(
                'Import Confirmation',
                'Apply these style settings to the current character?',
                () => {
                    // Import the settings to the target character
                    settings.characterSettings[targetCharInfo.id] = importData.settings;

                    // Save settings
                    saveSettingsDebounced();

                    // Show success message
                    toastr.success(`Style settings imported successfully`);

                    // Reload page after a short delay to ensure all settings are properly applied
                    setTimeout(() => {
                        window.location.reload();
                    }, 1000);
                }
            );
        } catch (err) {
            console.error('[CSC] Import error:', err);
            toastr.error('Failed to import: ' + err.message);
        }
    };

    reader.onerror = function() {
        toastr.error('Failed to read file');
    };

    reader.readAsText(file);
}

/**
 * Create a shared confirmation dialog helper
 * This function replaces all toast-based confirmations with proper dialogs
 * @param {string} title - Dialog title
 * @param {string} message - Confirmation message
 * @param {Function} onConfirm - Callback function executed on confirmation
 */
function showConfirmationDialog(title, message, onConfirm) {
    // Import popup utilities
    import('../../../popup.js').then(({ POPUP_TYPE, callGenericPopup }) => {
        // Create the dialog content with proper header and message
        const content = `
            <h3>${title}</h3>
            <p>${message}</p>
        `;

        // Show confirmation dialog using the proper SillyTavern popup system
        callGenericPopup(
            content,
            POPUP_TYPE.CONFIRM
        ).then((confirmed) => {
            if (confirmed) {
                onConfirm();
            }
        });
    });
}

// Placeholder for any helper functions related to import/export that might be needed
// This replaces the former addImportExportUI function which is no longer needed
function setupImportExportHelpers() {
    // Any common import/export initialization code can go here
    // This is kept as a placeholder in case we need to add any global helpers later
    console.log('[CSC] Import/Export feature initialized in character cards only');
}

// Create the settings UI
function createSettingsUI() {
    // Get extensions settings panel
    const extensionsSettings = document.getElementById('extensions_settings2');
    if (!extensionsSettings) return;

    // Create settings HTML
    const settingsHtml = `
    <div id="char-style-settings" class="cs-style-settings">
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>Character Style Customizer</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content">
                <small class="flex-container justifyCenter alignitemscenter" style="margin-top: 5px; margin-bottom: 15px; text-align: center;">
                    <span>Created with Heartfelt Passion by</span>
                    <a href="https://github.com/RivelleDays" target="_blank" rel="noopener noreferrer">Rivelle</a><br>
                    <span>Dedicated to All 可愛 (Kind &amp; Wonderful) People</span>
                </small>

                <div class="cs-style-settings-block">
                    <label class="checkbox_label" for="cs-style-enabled">
                        <input type="checkbox" id="cs-style-enabled" ${settings.enabled ? 'checked' : ''}>
                        <span>Enable Character Style Customizer</span>
                    </label>

                    <label class="checkbox_label" for="cs-style-enable-char-css">
                        <input type="checkbox" id="cs-style-enable-char-css" ${settings.enableCharacterCSS ? 'checked' : ''}>
                        <span>Enable Character-specific Message CSS</span>
                    </label>

                    <label class="checkbox_label" for="cs-style-enable-global-css">
                        <input type="checkbox" id="cs-style-enable-global-css" ${settings.enableGlobalCSS ? 'checked' : ''}>
                        <span>Enable Global Character CSS</span>
                    </label>

                    <div id="csc-settings-warning">
                        <i class="fa-solid fa-exclamation-triangle"></i> <b>Warning</b>: Custom CSS can dramatically alter the UI and potentially cause layout issues. Global CSS affects the entire page and should be used with caution.
                    </div>
                </div>

                <div class="cs-style-tabs">
                    <div class="cs-style-tab-buttons">
                        <button id="btn-global-styles" class="cs-style-tab-button active">Global Styles</button>
                        <button id="btn-user-styles" class="cs-style-tab-button">User Styles</button>
                        <button id="btn-character-styles" class="cs-style-tab-button">Character-Specific Styles</button>
                    </div>

                    <!-- Global Styles Tab -->
                    <div id="tab-global-styles" class="cs-style-tab-content active">
                        <div class="cs-style-settings-block">
                            <!-- Main Colors Section -->
                            <div class="cs-style-section">
                                <div class="cs-style-section-header cs-style-section-toggle">
                                    <h4>Main Colors <i class="fa-solid fa-chevron-down"></i></h4>
                                </div>
                                <div class="cs-style-section-content">
                                    <p class="cs-style-description">Set the color scheme that will be used for all characters</p>
                                    <div id="global-main-colors">
                                        <!-- Will be filled dynamically -->
                                    </div>
                                </div>
                            </div>

                            <!-- Color Mapping Section -->
                            <div class="cs-style-section">
                                <div class="cs-style-section-header cs-style-section-toggle">
                                    <h4>Element Color Mapping <i class="fa-solid fa-chevron-down"></i></h4>
                                </div>
                                <div class="cs-style-section-content">
                                    <p class="cs-style-description">Map text elements to your main colors</p>
                                    <div id="global-color-mapping">
                                        <!-- Will be filled dynamically -->
                                    </div>
                                </div>
                            </div>

                            <div class="cs-style-buttons" style="margin-top: 15px;">
                                <button id="cs-style-reapply" class="menu_button"><i class="fa-solid fa-save"></i> Apply</button>
                                <button id="cs-style-reset-global" class="menu_button"><i class="fa-solid fa-undo"></i> Reset</button>
                            </div>
                        </div>
                    </div>

                    <!-- User Styles Tab -->
                    <div id="tab-user-styles" class="cs-style-tab-content">
                        <div class="cs-style-settings-block">
                            <!-- User Main Colors Section -->
                            <div class="cs-style-section">
                                <div class="cs-style-section-header cs-style-section-toggle">
                                    <h4>User Colors <i class="fa-solid fa-chevron-down"></i></h4>
                                </div>
                                <div class="cs-style-section-content">
                                    <p class="cs-style-description">Set the color scheme for user messages</p>
                                    <div id="user-main-colors">
                                        <!-- Will be filled dynamically -->
                                    </div>
                                </div>
                            </div>

                            <div class="cs-style-buttons" style="margin-top: 15px;">
                                <button id="cs-style-apply-user" class="menu_button"><i class="fa-solid fa-sync"></i> Apply</button>
                                <button id="cs-style-reset-user" class="menu_button"><i class="fa-solid fa-undo"></i> Reset</button>
                            </div>
                        </div>
                    </div>

                    <!-- Character-Specific Styles Tab -->
                    <div id="tab-character-styles" class="cs-style-tab-content">
                        <div class="cs-style-settings-block">
                            <div class="cs-style-character-selector">
                                <label for="cs-style-character-select">Select Character:</label>
                                <div class="cs-style-select-container">
                                    <select id="cs-style-character-select" class="text_pole">
                                        <option value="">-- Select Character --</option>
                                    </select>
                                    <button id="cs-style-add-current" class="menu_button fa-solid fa-plus" title="Add Current Character"></button>
                                </div>
                            </div>

                            <div id="character-specific-settings" style="display:none">
                                <!-- Character-specific Main Colors Section -->
                                <div class="cs-style-section">
                                    <div class="cs-style-section-header cs-style-section-toggle">
                                        <h4>Main Colors <i class="fa-solid fa-chevron-down"></i></h4>
                                    </div>
                                    <div class="cs-style-section-content">
                                        <p class="cs-style-description">Override the global colors for this character</p>
                                        <div id="char-main-colors">
                                            <!-- Will be filled dynamically -->
                                        </div>
                                    </div>
                                </div>

                                <!-- Character-specific Specific Colors Section -->
                                <div class="cs-style-section">
                                    <div class="cs-style-section-header cs-style-section-toggle">
                                        <h4>Specific Colors <i class="fa-solid fa-chevron-down"></i></h4>
                                    </div>
                                    <div class="cs-style-section-content">
                                        <p class="cs-style-description">Set specific colors for this character</p>
                                        <div id="char-specific-colors">
                                            <!-- Will be filled dynamically -->
                                        </div>
                                    </div>
                                </div>

                                <!-- Message CSS Section -->
                                <div class="cs-style-section">
                                    <div class="cs-style-section-header cs-style-section-toggle">
                                        <h4>Message CSS <i class="fa-solid fa-chevron-down"></i></h4>
                                    </div>
                                    <div class="cs-style-section-content">
                                        <div id="message-css-container"></div>
                                    </div>
                                </div>

                                <!-- Global CSS Section -->
                                <div class="cs-style-section">
                                    <div class="cs-style-section-header cs-style-section-toggle">
                                        <h4>Global CSS <i class="fa-solid fa-chevron-down"></i></h4>
                                    </div>
                                    <div class="cs-style-section-content">
                                        <div class="cs-style-toggle-container">
                                            <input type="checkbox" id="character-enable-global-css" checked>
                                            <label for="character-enable-global-css">Enable Global CSS for this character</label>
                                        </div>
                                        <div id="global-css-container"></div>
                                    </div>
                                </div>

                                <div class="cs-style-buttons">
                                    <button id="cs-style-save" class="menu_button"><i class="fa-solid fa-save"></i> Save</button>
                                    <button id="cs-style-delete" class="menu_button"><i class="fa-solid fa-trash"></i> Delete</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <small class="flex-container justifyCenter alignitemscenter" style="margin-bottom: 10px; text-align: center;">
                    <span>Character Style Customizer Version</span>
                    <a href="https://github.com/RivelleDays/SillyTavern-CharacterStyleCustomizer" target="_blank" rel="noopener noreferrer" style="margin-left: 5px;">${EXTENSION_VERSION}</a>
                </small>
            </div>
        </div>
    </div>
    `;

    // Add settings to extensions panel
    extensionsSettings.insertAdjacentHTML('beforeend', settingsHtml);

    // Create CSS fields with info text
    const messageCssContainer = document.getElementById('message-css-container');
    if (messageCssContainer) {
        const messageCssField = createCssFieldWithInfo(
            'character-custom-css',
            "Enter custom CSS for this character's messages",
            "<i class=\"fa-solid fa-exclamation-triangle\"></i> Affects character messages only. Write CSS properties directly, no selectors needed."
        );
        messageCssContainer.appendChild(messageCssField);
    }

    const globalCssContainer = document.getElementById('global-css-container');
    if (globalCssContainer) {
        const globalCssField = createCssFieldWithInfo(
            'character-global-css',
            "Enter global CSS to apply when this character is active",
            "<i class=\"fa-solid fa-exclamation-triangle\"></i> Affects the entire page! May alter UI elements and conflict with other characters' CSS."
        );
        globalCssContainer.appendChild(globalCssField);
    }

    // Setup color pickers and event handlers
    setupGlobalMainColorPickers();
    setupUserMainColorPickers();
    setupColorMappingSelects();
    setupCharacterSelector();
    setupSettingsEvents();
    setupCollapsibleSections();

    // Initialize any import/export helpers if needed
    setupImportExportHelpers();
}

// Setup global main color pickers with real-time updates
function setupGlobalMainColorPickers() {
    const mainColors = settings.globalSettings.mainColors;
    const container = document.getElementById('global-main-colors');

    if (!container) return;

    // Clear existing content
    container.innerHTML = '';

    // Standard color items
    const standardItems = [];
    // Advanced color items
    const advancedItems = [];

    // Create each color picker
    getMainColorConfig('global').forEach(config => {
        const colorItem = createColorItem(
            config,
            mainColors[config.key],
            (color) => {
                settings.globalSettings.mainColors[config.key] = color;
                console.log(`[CSC] Global main color ${config.key} changed to ${color}`);

                // Immediately update main style
                updateMainStyle();

                // Reprocess all messages to apply new styles
                processAllMessages();

                // Save settings
                saveSettingsDebounced();
            }
        );

        if (config.advanced) {
            advancedItems.push(colorItem);
        } else {
            standardItems.push(colorItem);
        }
    });

    // Add standard items to container
    standardItems.forEach(item => container.appendChild(item));

    // Add advanced section if needed
    if (advancedItems.length > 0) {
        const advancedSection = createAdvancedSection(advancedItems);
        container.appendChild(advancedSection);
    }
}

// Setup user main color pickers with real-time updates
function setupUserMainColorPickers() {
    const userColors = settings.userSettings.mainColors;
    const container = document.getElementById('user-main-colors');

    if (!container) return;

    // Clear existing content
    container.innerHTML = '';

    // Standard color items
    const standardItems = [];
    // Advanced color items
    const advancedItems = [];

    // Create each color picker
    getMainColorConfig('user').forEach(config => {
        const colorItem = createColorItem(
            config,
            userColors[config.key],
            (color) => {
                settings.userSettings.mainColors[config.key] = color;
                console.log(`[CSC] User main color ${config.key} changed to ${color}`);

                // Immediately update main style
                updateMainStyle();

                // Reprocess all messages to apply new styles
                processAllMessages();

                // Save settings
                saveSettingsDebounced();
            }
        );

        if (config.advanced) {
            advancedItems.push(colorItem);
        } else {
            standardItems.push(colorItem);
        }
    });

    // Add standard items to container
    standardItems.forEach(item => container.appendChild(item));

    // Add advanced section if needed
    if (advancedItems.length > 0) {
        const advancedSection = createAdvancedSection(advancedItems);
        container.appendChild(advancedSection);
    }
}

// Setup color mapping selects with real-time updates
function setupColorMappingSelects() {
    const colorMapping = settings.globalSettings.colorMapping;
    const container = document.getElementById('global-color-mapping');

    if (!container) return;

    // Clear existing content
    container.innerHTML = '';

    // Standard mapping items
    const standardItems = [];
    // Advanced mapping items
    const advancedItems = [];

    // Set up each mapping item
    getColorMappingConfig().forEach(config => {
        const mappingItem = document.createElement('div');
        mappingItem.className = 'cs-style-mapping-item';

        // Create label
        const label = document.createElement('label');
        label.className = 'cs-style-mapping-label';
        label.textContent = config.label;
        label.setAttribute('for', config.id);

        // Create description
        const description = document.createElement('span');
        description.className = 'cs-style-mapping-description';
        description.textContent = config.description;

        // Create select
        const select = document.createElement('select');
        select.id = config.id;
        select.className = 'text_pole cs-mapping-select';

        // Add options
        select.innerHTML = `
            <option value="primary">Primary Color</option>
            <option value="secondary">Secondary Color</option>
            <option value="neutral">Default Color</option>
        `;

        // Set current value
        select.value = colorMapping[config.key] || 'neutral';

        // Add change handler
        select.addEventListener('change', () => {
            settings.globalSettings.colorMapping[config.key] = select.value;
            console.log(`[CSC] Color mapping for ${config.key} changed to ${select.value}`);

            // Immediately update main style
            updateMainStyle();

            // Immediately reprocess all messages to apply new mapping
            processAllMessages();

            // Save settings
            saveSettingsDebounced();
        });

        // Assemble the UI
        mappingItem.appendChild(label);
        mappingItem.appendChild(description);
        mappingItem.appendChild(select);

        if (config.advanced) {
            advancedItems.push(mappingItem);
        } else {
            standardItems.push(mappingItem);
        }
    });

    // Add standard items to container
    standardItems.forEach(item => container.appendChild(item));

    // Add advanced section if needed
    if (advancedItems.length > 0) {
        const advancedSection = createAdvancedSection(advancedItems);
        container.appendChild(advancedSection);
    }
}

// Update the character selector dropdown
function updateCharacterSelector(selectedCharId = null) {
    const select = document.getElementById('cs-style-character-select');
    if (!select) return;

    // Store the current selection
    const currentSelection = select.value;

    // Clear existing options
    select.innerHTML = '<option value="">-- Select Character --</option>';

    // Add options for characters with settings
    for (const charId in settings.characterSettings) {
        const option = document.createElement('option');
        option.value = charId;

        // Display a more friendly name if it's in the format type|name|avatar
        if (charId.includes('|')) {
            const parts = charId.split('|');
            const charType = parts[0];
            const charName = parts[1];
            const avatarName = parts[2];

            // Make character type display more user-friendly
            let typeDisplay = "Unknown";
            if (charType === CharacterType.CHARACTER) {
                typeDisplay = "Character";
            } else if (charType === CharacterType.PERSONA) {
                typeDisplay = "User";
            }

            option.textContent = `${charName} (${typeDisplay})`;
            option.title = `${charName}|${avatarName} (${typeDisplay})`;
        } else {
            // Legacy format: just use the avatar name
            option.textContent = charId;
            option.title = charId;
        }

        select.appendChild(option);
    }

    // Restore selection or set the new selection
    if (selectedCharId) {
        select.value = selectedCharId;
    } else if (currentSelection && Array.from(select.options).some(opt => opt.value === currentSelection)) {
        select.value = currentSelection;
    }

    // Trigger change event to update the UI
    select.dispatchEvent(new Event('change'));
}

// Create specific colors section for character settings with real-time updates
function createSpecificColorRows(container, charId) {
    if (!container) return;

    // Clear existing content
    container.innerHTML = '';

    // Character config
    const characterConfig = settings.characterSettings[charId] || { specificColors: {} };

    // Standard color items
    const standardItems = [];
    // Advanced color items
    const advancedItems = [];

    // Add color pickers for each element
    getColorMappingConfig().forEach(config => {
        const colorItem = createColorItem(
            {
                id: `char-specific-${config.key}`,
                key: config.key,
                label: config.label,
                description: config.description,
                advanced: config.advanced
            },
            characterConfig.specificColors?.[config.key] || '',
            (color) => {
                if (!settings.characterSettings[charId]) {
                    settings.characterSettings[charId] = {
                        mainColors: {},
                        specificColors: {},
                        customCSS: '',
                        globalCSS: '',
                        enableGlobalCSS: true
                    };
                }

                if (!settings.characterSettings[charId].specificColors) {
                    settings.characterSettings[charId].specificColors = {};
                }

                settings.characterSettings[charId].specificColors[config.key] = color;

                // Store current editing character ID for use in color picker updates
                window.lastSelectedCharacterId = charId;

                // Immediately update preview and main style to show changes
                updatePreviewStyle(charId);

                // For editing existing character, apply changes immediately
                if (getCurrentCharacter() && getCurrentCharacter().id === charId) {
                    updateMainStyle();
                    processAllMessages();
                }
            }
        );

        if (config.advanced) {
            advancedItems.push(colorItem);
        } else {
            standardItems.push(colorItem);
        }
    });

    // Add standard items to container
    standardItems.forEach(item => container.appendChild(item));

    // Add advanced section if needed
    if (advancedItems.length > 0) {
        const advancedSection = createAdvancedSection(advancedItems);
        container.appendChild(advancedSection);
    }
}

// Setup character selector and related UI with real-time updates
function setupCharacterSelector() {
    const select = document.getElementById('cs-style-character-select');
    if (!select) return;

    // Initial update of character list
    updateCharacterSelector();

    // Set up change handler
    select.addEventListener('change', () => {
        const characterSettings = document.getElementById('character-specific-settings');
        const charMainColors = document.getElementById('char-main-colors');
        const charSpecificColors = document.getElementById('char-specific-colors');
        const customCssArea = document.getElementById('character-custom-css');
        const globalCssArea = document.getElementById('character-global-css');
        const enableGlobalCssCheckbox = document.getElementById('character-enable-global-css');

        if (!select.value) {
            characterSettings.style.display = 'none';
            clearPreviewStyle();
            window.lastSelectedCharacterId = null; // Clear selected character ID
            return;
        }

        // Remember current selected character ID for use in color picker updates
        window.lastSelectedCharacterId = select.value;

        // Show settings panel
        characterSettings.style.display = 'block';

        // Get character settings
        const characterConfig = settings.characterSettings[select.value] || {
            mainColors: {},
            specificColors: {},
            customCSS: '',
            globalCSS: '',
            enableGlobalCSS: true
        };

        // Update CSS textareas
        if (customCssArea) {
            customCssArea.value = characterConfig.customCSS || '';
        }

        if (globalCssArea) {
            globalCssArea.value = characterConfig.globalCSS || '';
        }

        // Update Global CSS toggle
        if (enableGlobalCssCheckbox) {
            enableGlobalCssCheckbox.checked = characterConfig.enableGlobalCSS !== false;
        }

        // Clear existing color pickers
        charMainColors.innerHTML = '';
        charSpecificColors.innerHTML = '';

        // Standard color items
        const standardItems = [];
        // Advanced color items
        const advancedItems = [];

        // Set up main color pickers
        getMainColorConfig('character').forEach(config => {
            // Get the character-specific color
            const characterColor = characterConfig.mainColors?.[config.key] || '';

            const colorItem = createColorItem(
                config,
                characterColor,
                (color) => {
                    if (!settings.characterSettings[select.value]) {
                        settings.characterSettings[select.value] = {
                            mainColors: {},
                            specificColors: {},
                            customCSS: '',
                            globalCSS: '',
                            enableGlobalCSS: true
                        };
                    }

                    if (!settings.characterSettings[select.value].mainColors) {
                        settings.characterSettings[select.value].mainColors = {};
                    }

                    settings.characterSettings[select.value].mainColors[config.key] = color;

                    // Remember current selected character ID
                    window.lastSelectedCharacterId = select.value;

                    // Immediately update preview
                    updatePreviewStyle(select.value);

                    // If this is currently displayed character, also apply main style
                    if (getCurrentCharacter() && getCurrentCharacter().id === select.value) {
                        updateMainStyle();
                        processAllMessages();
                    }
                }
            );

            if (config.advanced) {
                advancedItems.push(colorItem);
            } else {
                standardItems.push(colorItem);
            }
        });

        // Add standard items to container
        standardItems.forEach(item => charMainColors.appendChild(item));

        // Add advanced section if needed
        if (advancedItems.length > 0) {
            const advancedSection = createAdvancedSection(advancedItems);
            charMainColors.appendChild(advancedSection);
        }

        // Create specific color section
        createSpecificColorRows(charSpecificColors, select.value);

        // Add input handler for message CSS
        customCssArea.addEventListener('input', () => {
            if (!settings.characterSettings[select.value]) {
                settings.characterSettings[select.value] = {
                    mainColors: {},
                    specificColors: {},
                    customCSS: '',
                    globalCSS: '',
                    enableGlobalCSS: true
                };
            }

            // Auto-update preview
            settings.characterSettings[select.value].customCSS = customCssArea.value;
            updatePreviewStyle(select.value);
        });

        // Add input handler for global CSS with real-time update
        globalCssArea.addEventListener('input', () => {
            if (!settings.characterSettings[select.value]) {
                settings.characterSettings[select.value] = {
                    mainColors: {},
                    specificColors: {},
                    customCSS: '',
                    globalCSS: '',
                    enableGlobalCSS: true
                };
            }

            settings.characterSettings[select.value].globalCSS = globalCssArea.value;

            // Apply Global CSS changes for real-time preview
            if (settings.enableGlobalCSS) {
                applyGlobalCSS(select.value);
            }
        });

        // Add change handler for global CSS toggle with real-time update
        enableGlobalCssCheckbox.addEventListener('change', () => {
            if (!settings.characterSettings[select.value]) {
                settings.characterSettings[select.value] = {
                    mainColors: {},
                    specificColors: {},
                    customCSS: '',
                    globalCSS: '',
                    enableGlobalCSS: true
                };
            }

            settings.characterSettings[select.value].enableGlobalCSS = enableGlobalCssCheckbox.checked;

            // Apply or clear Global CSS based on toggle state
            if (enableGlobalCssCheckbox.checked && settings.enableGlobalCSS) {
                applyGlobalCSS(select.value);
            } else {
                clearGlobalCSS();
            }
        });

        // Initial preview
        updatePreviewStyle(select.value);
    });
}

// Set up toggle behavior for card sections
function setupCardSectionToggle(section) {
    const header = section.querySelector('.cs-card-section-header');
    const content = section.querySelector('.cs-card-section-content');

    // All sections start collapsed
    content.style.maxHeight = '0';

    if (!header || !content) return;

    header.addEventListener('click', () => {
        const isExpanded = content.style.maxHeight !== '0px';
        const icon = header.querySelector('.cs-card-chevron');

        if (isExpanded) {
            content.style.maxHeight = '0';
            content.style.padding = '0';
            if (icon) icon.style.transform = 'rotate(0deg)';
        } else {
            content.style.maxHeight = '1000px';
            content.style.padding = '10px';
            if (icon) icon.style.transform = 'rotate(180deg)';
        }
    });
}

// Setup collapsible sections
function setupCollapsibleSections() {
    // Setup collapsible sections
    document.querySelectorAll('.cs-style-section-toggle').forEach(header => {
        const section = header.closest('.cs-style-section');
        const content = section.querySelector('.cs-style-section-content');

        // Default state is expanded
        section.classList.add('expanded');

        header.addEventListener('click', () => {
            // Toggle section expanded state
            section.classList.toggle('expanded');

            // Update icon
            const icon = header.querySelector('i');
            if (section.classList.contains('expanded')) {
                icon.className = 'fa-solid fa-chevron-up';
            } else {
                icon.className = 'fa-solid fa-chevron-down';
            }
        });
    });
}

// Add CSS help section to character card
function updateCharacterCardUI() {
    // Look for custom CSS section
    const customCssSection = document.querySelector('.cs-card-section:nth-child(3)');
    if (!customCssSection) return;

    // Update header to clarify it's for messages only
    const header = customCssSection.querySelector('.cs-card-section-header');
    if (header) {
        header.innerHTML = `<span>Message CSS</span><i class="fa-solid fa-chevron-down cs-card-chevron"></i>`;
    }

    // Update content with help info
    const content = customCssSection.querySelector('.cs-card-section-content');
    if (content) {
        const textarea = content.querySelector('textarea');
        if (textarea) {
            textarea.id = 'card-custom-css';
            textarea.placeholder = "Enter custom CSS for this character's messages";
        }

        // Add message CSS info
        const cssInfo = document.createElement('div');
        cssInfo.className = 'cs-style-css-info';
        cssInfo.innerHTML = "<i class=\"fa-solid fa-exclamation-triangle\"></i> Affects character messages only. Write CSS properties directly, no selectors needed.";

        // Insert before help section
        if (textarea && !content.querySelector('.cs-style-css-info')) {
            textarea.insertAdjacentElement('afterend', cssInfo);
        }
    }

    // Add new section for global CSS
    const globalCssSection = document.createElement('div');
    globalCssSection.className = 'cs-card-section';
    globalCssSection.innerHTML = `
    <div class="cs-card-section-header">
        <span>Global CSS</span>
        <i class="fa-solid fa-chevron-down cs-card-chevron"></i>
    </div>
    <div class="cs-card-section-content">
        <div class="cs-style-toggle-container">
            <input type="checkbox" id="card-enable-global-css" checked>
            <label for="card-enable-global-css">Enable Global CSS for this character</label>
        </div>
        <textarea id="card-global-css" class="text_pole"
            placeholder="Enter global CSS to apply when this character is active" rows="3"></textarea>
        <div class="cs-style-css-info">
            <i class="fa-solid fa-exclamation-triangle"></i> Affects the entire page! May alter UI elements and conflict with other characters' CSS.
        </div>
        <div id="card-global-css-help"></div>
    </div>
    `;

    // Add the new section
    customCssSection.parentNode.insertBefore(globalCssSection, customCssSection.nextSibling);

    // Add help section
    const globalHelpContainer = globalCssSection.querySelector('#card-global-css-help');
    globalHelpContainer.appendChild(createCssHelpSection('global'));

    // Setup toggle behavior
    setupCardSectionToggle(globalCssSection);

    // Update save handler
    updateCardSaveHandler();
}

// Setup settings events
function setupSettingsEvents() {
    // Tab switching for global styles
    document.getElementById('btn-global-styles').addEventListener('click', function() {
        document.querySelectorAll('.cs-style-tab-button').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.cs-style-tab-content').forEach(tab => tab.classList.remove('active'));

        document.getElementById('btn-global-styles').classList.add('active');
        document.getElementById('tab-global-styles').classList.add('active');
        clearPreviewStyle();
    });

    // Tab switching for user styles
    document.getElementById('btn-user-styles').addEventListener('click', function() {
        document.querySelectorAll('.cs-style-tab-button').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.cs-style-tab-content').forEach(tab => tab.classList.remove('active'));

        document.getElementById('btn-user-styles').classList.add('active');
        document.getElementById('tab-user-styles').classList.add('active');
        clearPreviewStyle();
    });

    // Tab switching for character styles
    document.getElementById('btn-character-styles').addEventListener('click', function() {
        document.querySelectorAll('.cs-style-tab-button').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.cs-style-tab-content').forEach(tab => tab.classList.remove('active'));

        document.getElementById('btn-character-styles').classList.add('active');
        document.getElementById('tab-character-styles').classList.add('active');

        // Trigger selection change to show/update preview if needed
        const select = document.getElementById('cs-style-character-select');
        if (select && select.value) {
            select.dispatchEvent(new Event('change'));
        }
    });

    // Enable/disable extension
    document.getElementById('cs-style-enabled').addEventListener('change', function() {
        settings.enabled = this.checked;
        updateMainStyle();
        saveSettingsDebounced();
    });

    // Enable/disable character CSS
    document.getElementById('cs-style-enable-char-css').addEventListener('change', function() {
        settings.enableCharacterCSS = this.checked;
        updateMainStyle();
        saveSettingsDebounced();
    });

    // Enable/disable global CSS
    document.getElementById('cs-style-enable-global-css').addEventListener('change', function() {
        settings.enableGlobalCSS = this.checked;
        updateMainStyle();
        saveSettingsDebounced();
    });

    // Add current character button
    document.getElementById('cs-style-add-current').addEventListener('click', function() {
        const currentChar = getCurrentCharacter();
        if (!currentChar) {
            toastr.warning('No character is currently selected.');
            return;
        }

        const charId = currentChar.id;

        // If no settings exist for this character, create default
        if (!settings.characterSettings[charId]) {
            settings.characterSettings[charId] = {
                mainColors: {},
                specificColors: {},
                customCSS: '',
                globalCSS: '',
                enableGlobalCSS: true
            };
            saveSettingsDebounced();
        }

        // Update selector and select this character
        updateCharacterSelector(charId);

        toastr.success(`Character added for styling`);
    });

    // Save character settings button
    document.getElementById('cs-style-save').addEventListener('click', function() {
        const select = document.getElementById('cs-style-character-select');
        if (!select.value) {
            toastr.warning('Please select a character first');
            return;
        }

        // Initialize settings if needed
        if (!settings.characterSettings[select.value]) {
            settings.characterSettings[select.value] = {
                mainColors: {},
                specificColors: {},
                customCSS: '',
                globalCSS: '',
                enableGlobalCSS: true
            };
        }

        // Get message CSS
        const customCssField = document.getElementById('character-custom-css');
        if (customCssField) {
            settings.characterSettings[select.value].customCSS = customCssField.value || '';
        }

        // Get global CSS
        const globalCssField = document.getElementById('character-global-css');
        if (globalCssField) {
            settings.characterSettings[select.value].globalCSS = globalCssField.value || '';
        }

        // Get global CSS toggle state
        const enableGlobalCssCheckbox = document.getElementById('character-enable-global-css');
        if (enableGlobalCssCheckbox) {
            settings.characterSettings[select.value].enableGlobalCSS = enableGlobalCssCheckbox.checked;
        }

        // Clear preview (it will be replaced by the permanent style)
        clearPreviewStyle();

        // Update permanent styles
        updateMainStyle();
        saveSettingsDebounced();

        toastr.success('Character settings saved');
    });

    // Delete character settings button
    document.getElementById('cs-style-delete').addEventListener('click', function() {
        const select = document.getElementById('cs-style-character-select');
        if (!select.value) {
            toastr.warning('Please select a character first');
            return;
        }

        showConfirmationDialog(
            'Delete Confirmation',
            'Are you sure you want to delete style settings for this character?',
            () => {
                // Clear preview
                clearPreviewStyle();

                // Delete character settings
                delete settings.characterSettings[select.value];

                // Update selector
                updateCharacterSelector();

                // Update styles
                updateMainStyle();
                saveSettingsDebounced();

                toastr.success('Character settings deleted');
            }
        );
    });

    // Reapply to existing messages
    document.getElementById('cs-style-reapply').addEventListener('click', function() {
        processAllMessages();
        updateMainStyle();
        toastr.success('Styles reapplied to all existing messages');
    });

    // Global settings reset button
    document.getElementById('cs-style-reset-global').addEventListener('click', function() {
        showConfirmationDialog(
            'Reset Confirmation',
            'Reset global settings to default values?',
            () => {
                // Reset main colors
                settings.globalSettings.mainColors = JSON.parse(JSON.stringify(defaultSettings.globalSettings.mainColors));

                // Reset element color mapping
                settings.globalSettings.colorMapping = JSON.parse(JSON.stringify(defaultSettings.globalSettings.colorMapping));

                // Update UI
                setupGlobalMainColorPickers();
                setupColorMappingSelects();

                // Update styles and save settings
                updateMainStyle();
                saveSettingsDebounced();

                // Reprocess all messages
                processAllMessages();

                toastr.success('Global settings reset to default');
            }
        );
    });

    // User settings reset button
    document.getElementById('cs-style-reset-user').addEventListener('click', function() {
        showConfirmationDialog(
            'Reset Confirmation',
            'Reset user settings to default values?',
            () => {
                // Reset user colors
                settings.userSettings.mainColors = JSON.parse(JSON.stringify(defaultSettings.userSettings.mainColors));

                // Update UI
                setupUserMainColorPickers();

                // Update styles and save settings
                updateMainStyle();
                saveSettingsDebounced();

                // Reprocess all messages
                processAllMessages();

                toastr.success('User settings reset to default');
            }
        );
    });
}

// Update card save handler with real-time updates
function updateCardSaveHandler() {
    const saveButton = document.getElementById('cs-card-save');
    if (!saveButton) return;

    // Replace the existing event listener
    const newSaveButton = saveButton.cloneNode(true);
    saveButton.parentNode.replaceChild(newSaveButton, saveButton);

    newSaveButton.addEventListener('click', function() {
        const charInfo = getCurrentEditingCharacterInfo();
        if (!charInfo || !charInfo.id) {
            toastr.warning('Unable to identify the current character.');
            return;
        }

        console.log(`[CSC] Saving card styles for character: ${charInfo.id}`);

        // Initialize character settings if needed
        if (!settings.characterSettings[charInfo.id]) {
            settings.characterSettings[charInfo.id] = {
                mainColors: {},
                specificColors: {},
                customCSS: '',
                globalCSS: '',
                enableGlobalCSS: true
            };
        }

        // Get main colors from pickers
        getMainColorConfig().forEach(config => {
            const input = document.getElementById(`card-color-${config.key}-text`);
            if (input) {
                if (input.value) {
                    console.log(`[CSC] Setting ${config.key} color to: ${input.value}`);
                    settings.characterSettings[charInfo.id].mainColors[config.key] = input.value;
                } else {
                    console.log(`[CSC] Removing ${config.key} color`);
                    delete settings.characterSettings[charInfo.id].mainColors[config.key];
                }
            }
        });

        // Get specific colors
        getColorMappingConfig().forEach(config => {
            const input = document.getElementById(`char-specific-${config.key}-text`);
            if (input) {
                if (input.value) {
                    console.log(`[CSC] Setting specific ${config.key} color to: ${input.value}`);
                    settings.characterSettings[charInfo.id].specificColors[config.key] = input.value;
                } else {
                    console.log(`[CSC] Removing specific ${config.key} color`);
                    delete settings.characterSettings[charInfo.id].specificColors[config.key];
                }
            }
        });

        // Get message CSS
        const customCssField = document.getElementById('card-custom-css');
        if (customCssField) {
            console.log(`[CSC] Setting custom CSS of length: ${customCssField.value.length}`);
            settings.characterSettings[charInfo.id].customCSS = customCssField.value || '';
        }

        // Get global CSS
        const globalCssField = document.getElementById('card-global-css');
        if (globalCssField) {
            console.log(`[CSC] Setting global CSS of length: ${globalCssField.value.length}`);
            settings.characterSettings[charInfo.id].globalCSS = globalCssField.value || '';
        }

        // Get global CSS toggle state
        const enableGlobalCssCheckbox = document.getElementById('card-enable-global-css');
        if (enableGlobalCssCheckbox) {
            console.log(`[CSC] Setting global CSS enabled: ${enableGlobalCssCheckbox.checked}`);
            settings.characterSettings[charInfo.id].enableGlobalCSS = enableGlobalCssCheckbox.checked;
        }

        // Save settings and apply immediately
        saveSettingsDebounced();

        // Apply Global CSS after saving if needed
        if (settings.enableGlobalCSS && settings.characterSettings[charInfo.id].enableGlobalCSS !== false) {
            console.log(`[CSC] Applying global CSS for character: ${charInfo.id}`);
            applyGlobalCSS(charInfo.id);
        }

        // Update main style
        updateMainStyle();

        // Reprocess all messages to apply new styles
        processAllMessages();

        // Update character selector in settings
        updateCharacterSelector(charInfo.id);

        toastr.success(`Style applied for ${charInfo.name}`);
    });
}

// Setup character card color pickers
function setupCharacterCardColorPickers() {
    const cardMainColors = document.getElementById('card-main-colors');
    if (!cardMainColors) return;

    // Clear existing content
    cardMainColors.innerHTML = '';

    const charInfo = getCurrentEditingCharacterInfo();
    if (!charInfo) {
        console.warn("[CSC] Could not get character info for card color pickers");
        return;
    }

    if (charInfo.id && settings.characterSettings[charInfo.id]) {
        console.log("[CSC] Character main colors:", settings.characterSettings[charInfo.id].mainColors);
        console.log("[CSC] Character specific colors:", settings.characterSettings[charInfo.id].specificColors);
    }

    // Set CSS fields if they exist
    const customCssField = document.getElementById('card-custom-css');
    const globalCssField = document.getElementById('card-global-css');
    const enableGlobalCssCheckbox = document.getElementById('card-enable-global-css');

    if (customCssField && charInfo.id && settings.characterSettings[charInfo.id]?.customCSS) {
        customCssField.value = settings.characterSettings[charInfo.id].customCSS;
    } else if (customCssField) {
        customCssField.value = '';
    }

    if (globalCssField && charInfo.id && settings.characterSettings[charInfo.id]?.globalCSS) {
        globalCssField.value = settings.characterSettings[charInfo.id].globalCSS;
    } else if (globalCssField) {
        globalCssField.value = '';
    }

    if (enableGlobalCssCheckbox && charInfo.id && settings.characterSettings[charInfo.id]) {
        enableGlobalCssCheckbox.checked = settings.characterSettings[charInfo.id].enableGlobalCSS !== false;
    } else if (enableGlobalCssCheckbox) {
        enableGlobalCssCheckbox.checked = true;
    }

    // Standard color items
    const standardItems = [];
    // Advanced color items
    const advancedItems = [];

    // Create main color pickers
    getMainColorConfig('character').forEach(config => {
        // Get saved color if exists (empty string if not set)
        let savedColor = '';
        if (charInfo && charInfo.id && settings.characterSettings[charInfo.id]?.mainColors?.[config.key]) {
            savedColor = settings.characterSettings[charInfo.id].mainColors[config.key];
        }

        const colorItem = createColorItem(
            {
                id: `card-color-${config.key}`,
                key: config.key,
                label: config.label,
                description: config.description,
                advanced: config.advanced
            },
            savedColor,
            (color) => {
                // Real-time preview update
                if (charInfo && charInfo.id) {
                    if (!settings.characterSettings[charInfo.id]) {
                        settings.characterSettings[charInfo.id] = {
                            mainColors: {},
                            specificColors: {},
                            customCSS: '',
                            globalCSS: '',
                            enableGlobalCSS: true
                        };
                    }

                    if (!settings.characterSettings[charInfo.id].mainColors) {
                        settings.characterSettings[charInfo.id].mainColors = {};
                    }

                    if (color) {
                        settings.characterSettings[charInfo.id].mainColors[config.key] = color;
                    } else {
                        delete settings.characterSettings[charInfo.id].mainColors[config.key];
                    }

                    // If this character is active, update main style
                    const currentChar = getCurrentCharacter();
                    if (currentChar && currentChar.id === charInfo.id) {
                        updateMainStyle();
                        processAllMessages();
                    }
                }
            }
        );

        if (config.advanced) {
            advancedItems.push(colorItem);
        } else {
            standardItems.push(colorItem);
        }
    });

    // Add standard items to container
    standardItems.forEach(item => cardMainColors.appendChild(item));

    // Add advanced section if needed
    if (advancedItems.length > 0) {
        const advancedSection = createAdvancedSection(advancedItems);
        cardMainColors.appendChild(advancedSection);
    }

    // Setup specific color pickers if character exists
    if (charInfo && charInfo.id) {
        const specificColorsContainer = document.getElementById('card-specific-colors');
        if (specificColorsContainer) {
            createSpecificColorRows(specificColorsContainer, charInfo.id);
        }
    }

    // Add real-time update for card CSS fields
    if (customCssField && charInfo.id) {
        customCssField.addEventListener('input', function() {
            if (!settings.characterSettings[charInfo.id]) {
                settings.characterSettings[charInfo.id] = {
                    mainColors: {},
                    specificColors: {},
                    customCSS: '',
                    globalCSS: '',
                    enableGlobalCSS: true
                };
            }

            // Update settings and preview
            settings.characterSettings[charInfo.id].customCSS = customCssField.value;

            // If this character is active, update main style
            const currentChar = getCurrentCharacter();
            if (currentChar && currentChar.id === charInfo.id) {
                updateMainStyle();
                processAllMessages();
            }
        });
    }

    if (globalCssField && charInfo.id) {
        globalCssField.addEventListener('input', function() {
            if (!settings.characterSettings[charInfo.id]) {
                settings.characterSettings[charInfo.id] = {
                    mainColors: {},
                    specificColors: {},
                    customCSS: '',
                    globalCSS: '',
                    enableGlobalCSS: true
                };
            }

            // Update settings
            settings.characterSettings[charInfo.id].globalCSS = globalCssField.value;

            // Apply Global CSS if character is active
            const currentChar = getCurrentCharacter();
            if (currentChar && currentChar.id === charInfo.id && settings.enableGlobalCSS) {
                applyGlobalCSS(charInfo.id);
            }
        });
    }

    if (enableGlobalCssCheckbox && charInfo.id) {
        enableGlobalCssCheckbox.addEventListener('change', function() {
            if (!settings.characterSettings[charInfo.id]) {
                settings.characterSettings[charInfo.id] = {
                    mainColors: {},
                    specificColors: {},
                    customCSS: '',
                    globalCSS: '',
                    enableGlobalCSS: true
                };
            }

            // Update settings
            settings.characterSettings[charInfo.id].enableGlobalCSS = enableGlobalCssCheckbox.checked;

            // Apply or clear Global CSS
            const currentChar = getCurrentCharacter();
            if (currentChar && currentChar.id === charInfo.id) {
                if (enableGlobalCssCheckbox.checked && settings.enableGlobalCSS) {
                    applyGlobalCSS(charInfo.id);
                } else {
                    clearGlobalCSS();
                }
            }
        });
    }
}

// Add style option to character card
function addStyleOptionToCharacterCard() {
    // Character card edit area selector
    const characterCardForm = document.getElementById('form_create');
    if (!characterCardForm) return;

    // Get avatar-and-name block
    const avatarNameBlock = characterCardForm.querySelector('#avatar-and-name-block');
    if (!avatarNameBlock) return;

    // Check if style option already added
    if (document.getElementById('cs-card-option')) {
        // Just update if already exists
        setupCharacterCardColorPickers();
        return;
    }

    // Create character style settings area
    const styleOption = document.createElement('div');
    styleOption.id = 'cs-card-option';
    styleOption.className = 'cs-card-style-settings';

    // Create the HTML with collapsible sections
    styleOption.innerHTML = `
        <div class="cs-card-section-title cs-style-section-toggle">
            <h4>Character Style <i class="fa-solid fa-chevron-down"></i></h4>
        </div>

        <div id="card-style-content" class="cs-style-section-content" style="max-height: 0; padding: 0;">
            <div class="cs-card-section">
                <div class="cs-card-section-header">
                    <span>Main Colors</span>
                    <i class="fa-solid fa-chevron-down cs-card-chevron"></i>
                </div>
                <div class="cs-card-section-content">
                    <div id="card-main-colors">
                        <!-- Will be filled dynamically -->
                    </div>
                </div>
            </div>

            <div class="cs-card-section">
                <div class="cs-card-section-header">
                    <span>Specific Colors</span>
                    <i class="fa-solid fa-chevron-down cs-card-chevron"></i>
                </div>
                <div class="cs-card-section-content" id="card-specific-colors">
                    <!-- Will be filled dynamically -->
                </div>
            </div>

            <div class="cs-card-section">
                <div class="cs-card-section-header">
                    <span>Message CSS</span>
                    <i class="fa-solid fa-chevron-down cs-card-chevron"></i>
                </div>
                <div class="cs-card-section-content">
                    <textarea id="card-custom-css" class="text_pole"
                        placeholder="Enter custom CSS for this character's messages" rows="3"></textarea>
                    <div class="cs-style-css-info">
                        <i class="fa-solid fa-exclamation-triangle"></i> Affects character messages only. Write CSS properties directly, no selectors needed.
                    </div>
                </div>
            </div>

            <div class="cs-card-section">
                <div class="cs-card-section-header">
                    <span>Global CSS</span>
                    <i class="fa-solid fa-chevron-down cs-card-chevron"></i>
                </div>
                <div class="cs-card-section-content">
                    <div class="cs-style-toggle-container">
                        <input type="checkbox" id="card-enable-global-css" checked>
                        <label for="card-enable-global-css">Enable Global CSS for this character</label>
                    </div>
                    <textarea id="card-global-css" class="text_pole"
                        placeholder="Enter global CSS to apply when this character is active" rows="3"></textarea>
                    <div class="cs-style-css-info">
                        <i class="fa-solid fa-exclamation-triangle"></i> Affects the entire page! May alter UI elements and conflict with other characters' CSS.
                    </div>
                    <div id="card-global-css-help"></div>
                </div>
            </div>

            <div class="cs-card-buttons">
                <button id="cs-card-save" title="Save" class="menu_button"><i class="fa-solid fa-save"></i></button>
                <button id="cs-card-reset" title="Reset" class="menu_button"><i class="fa-solid fa-undo"></i></button>
                <button id="cs-card-export" title="Export" class="menu_button"><i class="fa-solid fa-file-export"></i></button>
                <label for="cs-card-import-file" title="Import" class="menu_button"><i class="fa-solid fa-file-import"></i></label>
                <input type="file" id="cs-card-import-file" style="display: none;" accept=".json">
            </div>
        </div>
    `;

    // Add to avatar-and-name-block
    avatarNameBlock.appendChild(styleOption);

    // Setup main title toggle
    const titleToggle = styleOption.querySelector('.cs-card-section-title');
    const mainContent = document.getElementById('card-style-content');

    titleToggle.addEventListener('click', () => {
        const isExpanded = mainContent.style.maxHeight !== '0px';
        const icon = titleToggle.querySelector('i');

        if (isExpanded) {
            mainContent.style.maxHeight = '0';
            mainContent.style.padding = '0';
            icon.className = 'fa-solid fa-chevron-down';
        } else {
            mainContent.style.maxHeight = '2000px';
            mainContent.style.padding = '10px';
            icon.className = 'fa-solid fa-chevron-up';

            // Fill in color pickers if not already done
            setupCharacterCardColorPickers();
        }
    });

    // Setup collapsible sections
    styleOption.querySelectorAll('.cs-card-section').forEach(section => {
        const header = section.querySelector('.cs-card-section-header');
        const content = section.querySelector('.cs-card-section-content');

        // All sections start collapsed
        content.style.maxHeight = '0';

        header.addEventListener('click', () => {
            const isExpanded = content.style.maxHeight !== '0px';
            const icon = header.querySelector('.cs-card-chevron');

            if (isExpanded) {
                content.style.maxHeight = '0';
                content.style.padding = '0 10px';
                icon.style.transform = 'rotate(0deg)';
            } else {
                content.style.maxHeight = '1000px';
                content.style.padding = '10px';
                icon.style.transform = 'rotate(180deg)';
            }
        });
    });

    // Add reset button functionality with toastr confirmation
    document.getElementById('cs-card-reset').addEventListener('click', function() {
        const charInfo = getCurrentEditingCharacterInfo();
        if (!charInfo || !charInfo.id) {
            toastr.warning('Unable to identify the current character.');
            return;
        }

        showConfirmationDialog(
            'Reset Confirmation',
            'Reset all style settings for this character?',
            () => {
                // Delete character settings
                delete settings.characterSettings[charInfo.id];

                // Update UI
                setupCharacterCardColorPickers();

                // Update specific colors
                const specificColorsContainer = document.getElementById('card-specific-colors');
                if (specificColorsContainer) {
                    createSpecificColorRows(specificColorsContainer, charInfo.id);
                }

                // Update styles
                updateMainStyle();
                saveSettingsDebounced();

                toastr.success(`Style reset for ${charInfo.name}`);
            }
        );
    });

    // Setup export button
    document.getElementById('cs-card-export').addEventListener('click', function() {
        const charInfo = getCurrentEditingCharacterInfo();
        if (!charInfo || !charInfo.id) {
            toastr.warning('Unable to identify the current character.');
            return;
        }

        exportCharacterStyle(charInfo.id);
    });

    // Setup import button
    const importInput = document.getElementById('cs-card-import-file');
    importInput.addEventListener('change', (e) => {
        importCharacterStyle(e.target.files);
        // Reset the input to allow importing the same file again
        e.target.value = '';
    });
}

// Add style option to user persona settings with real-time updates
function addStyleOptionToUserPersona() {
    // Look for persona description element
    const elemPersonaDescription = document.getElementById("persona_description");
    if (!elemPersonaDescription) {
        console.warn('[CSC] Persona description element not found, waiting for app ready event');
        // If not found yet, wait for app ready
        eventSource.once(event_types.APP_READY, () => {
            setTimeout(addStyleOptionToUserPersona, 1000); // Try again after 1 second
        });
        return;
    }

    // Check if already added
    if (document.getElementById('cs-persona-style-option')) return;

    // Create persona style settings area
    const styleOption = document.createElement('div');
    styleOption.id = 'cs-persona-style-option';
    styleOption.className = 'cs-persona-style-option';

    styleOption.innerHTML = `
        <div class="cs-card-section-title cs-style-section-toggle">
            <h4>Persona Style <i class="fa-solid fa-chevron-down"></i></h4>
        </div>

        <div id="persona-style-content" class="cs-style-section-content" style="max-height: 0; padding: 0;">
            <div class="cs-card-section">
                <div class="cs-card-section-header">
                    <span>Main Colors</span>
                    <i class="fa-solid fa-chevron-down cs-card-chevron"></i>
                </div>
                <div class="cs-card-section-content">
                    <div id="persona-main-colors">
                        <!-- Will be filled dynamically -->
                    </div>
                </div>
            </div>

            <div class="cs-card-section">
                <div class="cs-card-section-header">
                    <span>Specific Colors</span>
                    <i class="fa-solid fa-chevron-down cs-card-chevron"></i>
                </div>
                <div class="cs-card-section-content" id="persona-specific-colors">
                    <!-- Will be filled dynamically -->
                </div>
            </div>

            <div class="cs-card-section">
                <div class="cs-card-section-header">
                    <span>Message CSS</span>
                    <i class="fa-solid fa-chevron-down cs-card-chevron"></i>
                </div>
                <div class="cs-card-section-content">
                    <textarea id="persona-custom-css" class="text_pole"
                        placeholder="Enter custom CSS for your persona's messages" rows="3"></textarea>
                    <div class="cs-style-css-info">
                        CSS will be scoped to your persona's messages only. You don't need to add any selectors - just write the CSS properties.
                    </div>
                </div>
            </div>

            <div class="cs-card-section">
                <div class="cs-card-section-header">
                    <span>Global CSS</span>
                    <i class="fa-solid fa-chevron-down cs-card-chevron"></i>
                </div>
                <div class="cs-card-section-content">
                    <div class="cs-style-toggle-container">
                        <input type="checkbox" id="persona-enable-global-css" checked>
                        <label for="persona-enable-global-css">Enable Global CSS for this persona</label>
                    </div>
                    <textarea id="persona-global-css" class="text_pole"
                        placeholder="Enter global CSS to apply when this persona is active" rows="3"></textarea>
                    <div class="cs-style-css-info">
                        This CSS affects the entire page when this persona is active. Use with caution as it can affect UI elements and may conflict with other characters' global CSS.
                    </div>
                </div>
            </div>

            <div class="cs-card-buttons">
                <button id="cs-persona-style-save" title="Save" class="menu_button"><i class="fa-solid fa-save"></i></button>
                <button id="cs-persona-style-reset" title="Reset" class="menu_button"><i class="fa-solid fa-undo"></i></button>
                <button id="cs-persona-export" title="Export" class="menu_button"><i class="fa-solid fa-file-export"></i></button>
                <label for="cs-persona-import-file" title="Import" class="menu_button"><i class="fa-solid fa-file-import"></i></label>
                <input type="file" id="cs-persona-import-file" style="display: none;" accept=".json">
            </div>
        </div>
    `;

    // Add to persona description parent
    const elemDescParent = elemPersonaDescription.parentElement;
    elemDescParent.insertAdjacentElement("afterbegin", styleOption);

    // Setup main title toggle
    const titleToggle = styleOption.querySelector('.cs-card-section-title');
    const mainContent = document.getElementById('persona-style-content');

    titleToggle.addEventListener('click', () => {
        const isExpanded = mainContent.style.maxHeight !== '0px';
        const icon = titleToggle.querySelector('i');

        if (isExpanded) {
            mainContent.style.maxHeight = '0';
            mainContent.style.padding = '0';
            icon.className = 'fa-solid fa-chevron-down';
        } else {
            mainContent.style.maxHeight = '2000px';
            icon.className = 'fa-solid fa-chevron-up';

            // Fill in color pickers if not already done
            setupPersonaColorPickers();
        }
    });

    // Setup collapsible sections
    styleOption.querySelectorAll('.cs-card-section').forEach(section => {
        const header = section.querySelector('.cs-card-section-header');
        const content = section.querySelector('.cs-card-section-content');

        // All sections start collapsed
        content.style.maxHeight = '0';

        header.addEventListener('click', () => {
            const isExpanded = content.style.maxHeight !== '0px';
            const icon = header.querySelector('.cs-card-chevron');

            if (isExpanded) {
                content.style.maxHeight = '0';
                content.style.padding = '0 10px';
                icon.style.transform = 'rotate(0deg)';
            } else {
                content.style.maxHeight = '1000px';
                content.style.padding = '10px';
                icon.style.transform = 'rotate(180deg)';
            }
        });
    });

    // Setup persona-specific color pickers
    const specificColorsContainer = document.getElementById('persona-specific-colors');
    if (specificColorsContainer) {
        const persona = getCurrentPersona();
        if (persona) {
            createSpecificColorRows(specificColorsContainer, persona.id);
        }
    }

    // Save button
    document.getElementById('cs-persona-style-save').addEventListener('click', function() {
        const persona = getCurrentPersona();
        if (!persona) {
            toastr.warning('Could not determine current persona');
            return;
        }

        const personaId = persona.id;

        // Initialize settings if needed
        if (!settings.characterSettings[personaId]) {
            settings.characterSettings[personaId] = {
                mainColors: {},
                specificColors: {},
                customCSS: '',
                globalCSS: '',
                enableGlobalCSS: true
            };
        }

        // Get main colors from pickers
        getMainColorConfig().forEach(config => {
            const input = document.getElementById(`persona-color-${config.key}-text`);
            if (input) {
                if (!settings.characterSettings[personaId].mainColors) {
                    settings.characterSettings[personaId].mainColors = {};
                }

                // Only save if non-empty
                if (input.value) {
                    settings.characterSettings[personaId].mainColors[config.key] = input.value;
                } else {
                    delete settings.characterSettings[personaId].mainColors[config.key];
                }
            }
        });

        // Get specific colors
        getColorMappingConfig().forEach(config => {
            const input = document.getElementById(`char-specific-${config.key}-text`);
            if (input) {
                if (!settings.characterSettings[personaId].specificColors) {
                    settings.characterSettings[personaId].specificColors = {};
                }

                // Only save if non-empty
                if (input.value) {
                    settings.characterSettings[personaId].specificColors[config.key] = input.value;
                } else {
                    delete settings.characterSettings[personaId].specificColors[config.key];
                }
            }
        });

        // Get message CSS
        const customCssField = document.getElementById('persona-custom-css');
        if (customCssField) {
            settings.characterSettings[personaId].customCSS = customCssField.value || '';
        }

        // Get global CSS
        const globalCssField = document.getElementById('persona-global-css');
        if (globalCssField) {
            settings.characterSettings[personaId].globalCSS = globalCssField.value || '';
        }

        // Get global CSS toggle state
        const enableGlobalCssCheckbox = document.getElementById('persona-enable-global-css');
        if (enableGlobalCssCheckbox) {
            settings.characterSettings[personaId].enableGlobalCSS = enableGlobalCssCheckbox.checked;
        }

        // Save settings and update styles
        saveSettingsDebounced();
        updateMainStyle();
        processAllMessages();

        // Update character selector in settings
        updateCharacterSelector(personaId);

        toastr.success('Persona style applied');
    });

    // Reset button with toastr confirmation
    document.getElementById('cs-persona-style-reset').addEventListener('click', function() {
        const persona = getCurrentPersona();
        if (!persona) {
            toastr.warning('Could not determine current persona');
            return;
        }

        showConfirmationDialog(
            'Reset Confirmation',
            'Reset all style settings for this persona?',
            () => {
                const personaId = persona.id;

                // Delete persona settings
                delete settings.characterSettings[personaId];

                // Update UI
                setupPersonaColorPickers();

                // Update specific colors
                const specificColorsContainer = document.getElementById('persona-specific-colors');
                if (specificColorsContainer) {
                    createSpecificColorRows(specificColorsContainer, personaId);
                }

                // Update styles
                updateMainStyle();
                saveSettingsDebounced();

                // Update character selector
                updateCharacterSelector();

                toastr.success('Persona style reset to default');
            }
        );
    });

    // Export button
    document.getElementById('cs-persona-export').addEventListener('click', function() {
        const persona = getCurrentPersona();
        if (!persona) {
            toastr.warning('Could not determine current persona');
            return;
        }

        exportCharacterStyle(persona.id);
    });

    // Import button
    const importInput = document.getElementById('cs-persona-import-file');
    importInput.addEventListener('change', (e) => {
        importCharacterStyle(e.target.files);
        // Reset input to allow importing the same file again
        e.target.value = '';
    });

    // Setup persona color pickers
    setupPersonaColorPickers();
}

// Setup color pickers for persona UI with real-time updates
function setupPersonaColorPickers() {
    const personaMainColors = document.getElementById('persona-main-colors');
    if (!personaMainColors) return;

    // Clear existing content
    personaMainColors.innerHTML = '';

    const persona = getCurrentPersona();
    if (!persona) {
        console.warn("[CSC] Could not get persona info for color pickers");
        return;
    }

    const personaId = persona.id;
    const personaSettings = settings.characterSettings[personaId] || { mainColors: {}, specificColors: {} };

    // Set CSS fields if configured
    const customCssField = document.getElementById('persona-custom-css');
    const globalCssField = document.getElementById('persona-global-css');
    const enableGlobalCssCheckbox = document.getElementById('persona-enable-global-css');

    if (customCssField) {
        customCssField.value = personaSettings.customCSS || '';

        // Add real-time update handler
        if (!customCssField.hasEventListener) {
            customCssField.hasEventListener = true;
            customCssField.addEventListener('input', function() {
                if (!settings.characterSettings[personaId]) {
                    settings.characterSettings[personaId] = {
                        mainColors: {},
                        specificColors: {},
                        customCSS: '',
                        globalCSS: '',
                        enableGlobalCSS: true
                    };
                }

                // Update settings
                settings.characterSettings[personaId].customCSS = customCssField.value;

                // If this is current user persona, update preview
                if (getCurrentPersona().id === personaId) {
                    updatePreviewStyle(personaId);
                }
            });
        }
    }

    if (globalCssField) {
        globalCssField.value = personaSettings.globalCSS || '';

        // Add real-time update handler
        if (!globalCssField.hasEventListener) {
            globalCssField.hasEventListener = true;
            globalCssField.addEventListener('input', function() {
                if (!settings.characterSettings[personaId]) {
                    settings.characterSettings[personaId] = {
                        mainColors: {},
                        specificColors: {},
                        customCSS: '',
                        globalCSS: '',
                        enableGlobalCSS: true
                    };
                }

                // Update settings
                settings.characterSettings[personaId].globalCSS = globalCssField.value;

                // If this is current user persona, apply global CSS
                if (getCurrentPersona().id === personaId && settings.enableGlobalCSS) {
                    applyGlobalCSS(personaId);
                }
            });
        }
    }

    if (enableGlobalCssCheckbox) {
        enableGlobalCssCheckbox.checked = personaSettings.enableGlobalCSS !== false;

        // Add real-time update handler
        if (!enableGlobalCssCheckbox.hasEventListener) {
            enableGlobalCssCheckbox.hasEventListener = true;
            enableGlobalCssCheckbox.addEventListener('change', function() {
                if (!settings.characterSettings[personaId]) {
                    settings.characterSettings[personaId] = {
                        mainColors: {},
                        specificColors: {},
                        customCSS: '',
                        globalCSS: '',
                        enableGlobalCSS: true
                    };
                }

                // Update settings
                settings.characterSettings[personaId].enableGlobalCSS = enableGlobalCssCheckbox.checked;

                // If this is current user persona, apply or clear global CSS
                if (getCurrentPersona().id === personaId) {
                    if (enableGlobalCssCheckbox.checked && settings.enableGlobalCSS) {
                        applyGlobalCSS(personaId);
                    } else {
                        clearGlobalCSS();
                    }
                }
            });
        }
    }

    // Standard color items
    const standardItems = [];
    // Advanced color items
    const advancedItems = [];

    // Create main color pickers
    getMainColorConfig('persona').forEach(config => {
        // Get saved color or empty string if not set
        const savedColor = personaSettings.mainColors?.[config.key] || '';

        const colorItem = createColorItem(
            {
                id: `persona-color-${config.key}`,
                key: config.key,
                label: config.label,
                description: config.description,
                advanced: config.advanced
            },
            savedColor,
            (color) => {
                // Real-time update for color
                if (!settings.characterSettings[personaId]) {
                    settings.characterSettings[personaId] = {
                        mainColors: {},
                        specificColors: {},
                        customCSS: '',
                        globalCSS: '',
                        enableGlobalCSS: true
                    };
                }

                if (!settings.characterSettings[personaId].mainColors) {
                    settings.characterSettings[personaId].mainColors = {};
                }

                // Update color setting
                if (color) {
                    settings.characterSettings[personaId].mainColors[config.key] = color;
                } else {
                    delete settings.characterSettings[personaId].mainColors[config.key];
                }

                // If this is current user persona, update preview
                const currentPersona = getCurrentPersona();
                if (currentPersona && currentPersona.id === personaId) {
                    // Store current selected character ID for preview updates
                    window.lastSelectedCharacterId = personaId;

                    // Update preview
                    updatePreviewStyle(personaId);

                    // Update main style
                    updateMainStyle();

                    // Reprocess all messages
                    processAllMessages();
                }
            }
        );

        if (config.advanced) {
            advancedItems.push(colorItem);
        } else {
            standardItems.push(colorItem);
        }
    });

    // Add standard items to container
    standardItems.forEach(item => personaMainColors.appendChild(item));

    // Add advanced section if needed
    if (advancedItems.length > 0) {
        const advancedSection = createAdvancedSection(advancedItems);
        personaMainColors.appendChild(advancedSection);
    }

    // Update specific colors
    const specificColorsContainer = document.getElementById('persona-specific-colors');
    if (specificColorsContainer) {
        createSpecificColorRows(specificColorsContainer, personaId);
    }
}

// Setup persona change tracking
function setupPersonaChangeTracking() {
    const originalOnPersonaChange = power_user.onPersonaChange;

    power_user.onPersonaChange = function(...args) {
        // Call original function
        if (originalOnPersonaChange) {
            originalOnPersonaChange.apply(this, args);
        }

        // Emit our custom event
        const currentPersona = getCurrentPersona();
        if (currentPersona) {
            console.log('[CSC] Persona change detected:', currentPersona);
            exp_event_source.emit(exp_event_type.PERSONA_CHANGED, currentPersona);
        }
    };

    // Listen for persona changes
    exp_event_source.on(exp_event_type.PERSONA_CHANGED, (persona) => {
        console.log("[CSC] Handling persona change:", persona);

        // Ensure UI updates
        setTimeout(() => {
            // Update persona color pickers
            setupPersonaColorPickers();

            // Update specific colors
            const specificColorsContainer = document.getElementById('persona-specific-colors');
            if (specificColorsContainer && persona) {
                createSpecificColorRows(specificColorsContainer, persona.id);
            }

            // Update CSS fields
            const customCssField = document.getElementById('persona-custom-css');
            const globalCssField = document.getElementById('persona-global-css');
            const enableGlobalCssCheckbox = document.getElementById('persona-enable-global-css');

            if (customCssField && persona && settings.characterSettings[persona.id]?.customCSS) {
                customCssField.value = settings.characterSettings[persona.id].customCSS;
            } else if (customCssField) {
                customCssField.value = '';
            }

            if (globalCssField && persona && settings.characterSettings[persona.id]?.globalCSS) {
                globalCssField.value = settings.characterSettings[persona.id].globalCSS;
            } else if (globalCssField) {
                globalCssField.value = '';
            }

            if (enableGlobalCssCheckbox && persona && settings.characterSettings[persona.id]) {
                enableGlobalCssCheckbox.checked = settings.characterSettings[persona.id].enableGlobalCSS !== false;
            } else if (enableGlobalCssCheckbox) {
                enableGlobalCssCheckbox.checked = true;
            }

            // Update styles
            updateMainStyle();
        }, 100);
    });

    // Listen for avatar clicks
    document.addEventListener('click', (e) => {
        // Check if a user avatar was clicked
        const avatarContainer = e.target.closest('#user_avatar_block .avatar-container');
        if (avatarContainer) {
            setTimeout(() => {
                const persona = getCurrentPersona();
                if (persona) {
                    exp_event_source.emit(exp_event_type.PERSONA_CHANGED, persona);
                }
            }, 200); // Slight delay to ensure avatar selection is complete
        }
    });

    // Periodically check for persona changes
    setInterval(() => {
        const currentPersona = getCurrentPersona();
        // Use a simple string comparison to detect changes
        const personaKey = `${currentPersona.name}|${currentPersona.avatar}`;

        if (window._lastPersonaKey && window._lastPersonaKey !== personaKey) {
            console.log('[CSC] Persona change detected by interval check');
            exp_event_source.emit(exp_event_type.PERSONA_CHANGED, currentPersona);
        }

        window._lastPersonaKey = personaKey;
    }, 2000);
}

/**
 * Generate CSS for a character with improved element mapping
 * @param {string} characterId Character ID
 * @param {Object} characterConfig Character configuration
 * @param {Object} globalColorMapping Global color mapping settings
 * @returns {string} Generated CSS
 */
function generateCharacterCSS(characterId, characterConfig, globalColorMapping) {
    if (!characterConfig) return '';

    // Use global mapping settings or default
    const colorMapping = globalColorMapping || settings.globalSettings.colorMapping;

    // Prepare the color configuration
    const mainColors = {
        primary: characterConfig.mainColors?.primary || 'var(--csc-primary)',
        secondary: characterConfig.mainColors?.secondary || 'var(--csc-secondary)',
        bgPrimary: characterConfig.mainColors?.bgPrimary || 'var(--csc-bg-primary)',
        bgSecondary: characterConfig.mainColors?.bgSecondary || 'var(--csc-bg-secondary)'
    };

    const specificColors = characterConfig.specificColors || {};

    // Character selector
    const characterSelector = `.mes[csc-author-uid="${characterId}"]`;

    // First define character-specific CSS variables
    let css = `
    ${characterSelector} {
        --csc-char-primary: ${mainColors.primary};
        --csc-char-secondary: ${mainColors.secondary};
        --csc-char-bg-primary: ${mainColors.bgPrimary};
        --csc-char-bg-secondary: ${mainColors.bgSecondary};
    }
    `;

    // Apply character name color (always uses primary color unless specifically overridden)
    if (specificColors.characterName) {
        css += `
        ${characterSelector} .name_text {
            color: ${specificColors.characterName} !important;
        }
        `;
    } else {
        css += `
        ${characterSelector} .name_text {
            color: var(--csc-char-primary) !important;
        }
        `;
    }

    // Apply main text color if specified
    if (specificColors.mainText) {
        css += `
        ${characterSelector} .mes_text {
            color: ${specificColors.mainText} !important;
        }
        `;
    } else if (colorMapping.mainText === 'primary') {
        css += `
        ${characterSelector} .mes_text {
            color: var(--csc-char-primary) !important;
        }
        `;
    } else if (colorMapping.mainText === 'secondary') {
        css += `
        ${characterSelector} .mes_text {
            color: var(--csc-char-secondary) !important;
        }
        `;
    }

    // Apply quoted text color
    if (specificColors.quotes) {
        css += `
        ${characterSelector} .mes_text q {
            color: ${specificColors.quotes} !important;
        }
        `;
    } else if (colorMapping.quotes === 'primary') {
        css += `
        ${characterSelector} .mes_text q {
            color: var(--csc-char-primary) !important;
        }
        `;
    } else if (colorMapping.quotes === 'secondary') {
        css += `
        ${characterSelector} .mes_text q {
            color: var(--csc-char-secondary) !important;
        }
        `;
    }

    // Apply bold text color
    if (specificColors.bold) {
        css += `
        ${characterSelector} .mes_text b,
        ${characterSelector} .mes_text strong {
            color: ${specificColors.bold} !important;
        }
        `;
    } else if (colorMapping.bold === 'primary') {
        css += `
        ${characterSelector} .mes_text b,
        ${characterSelector} .mes_text strong {
            color: var(--csc-char-primary) !important;
        }
        `;
    } else if (colorMapping.bold === 'secondary') {
        css += `
        ${characterSelector} .mes_text b,
        ${characterSelector} .mes_text strong {
            color: var(--csc-char-secondary) !important;
        }
        `;
    }

    // Apply italic text color
    if (specificColors.italic) {
        css += `
        ${characterSelector} .mes_text i,
        ${characterSelector} .mes_text em {
            color: ${specificColors.italic} !important;
        }
        `;
    } else if (colorMapping.italic === 'primary') {
        css += `
        ${characterSelector} .mes_text i,
        ${characterSelector} .mes_text em {
            color: var(--csc-char-primary) !important;
        }
        `;
    } else if (colorMapping.italic === 'secondary') {
        css += `
        ${characterSelector} .mes_text i,
        ${characterSelector} .mes_text em {
            color: var(--csc-char-secondary) !important;
        }
        `;
    }

    // Apply bold+italic text color
    if (specificColors.boldItalic) {
        css += `
        ${characterSelector} .mes_text b i,
        ${characterSelector} .mes_text strong em,
        ${characterSelector} .mes_text i b,
        ${characterSelector} .mes_text em strong {
            color: ${specificColors.boldItalic} !important;
        }
        `;
    } else if (colorMapping.boldItalic === 'primary') {
        css += `
        ${characterSelector} .mes_text b i,
        ${characterSelector} .mes_text strong em,
        ${characterSelector} .mes_text i b,
        ${characterSelector} .mes_text em strong {
            color: var(--csc-char-primary) !important;
        }
        `;
    } else if (colorMapping.boldItalic === 'secondary') {
        css += `
        ${characterSelector} .mes_text b i,
        ${characterSelector} .mes_text strong em,
        ${characterSelector} .mes_text i b,
        ${characterSelector} .mes_text em strong {
            color: var(--csc-char-secondary) !important;
        }
        `;
    }

    // Apply underline text color
    if (specificColors.underline) {
        css += `
        ${characterSelector} .mes_text u {
            color: ${specificColors.underline} !important;
        }
        `;
    } else if (colorMapping.underline === 'primary') {
        css += `
        ${characterSelector} .mes_text u {
            color: var(--csc-char-primary) !important;
        }
        `;
    } else if (colorMapping.underline === 'secondary') {
        css += `
        ${characterSelector} .mes_text u {
            color: var(--csc-char-secondary) !important;
        }
        `;
    }

    // Apply strikethrough text color
    if (specificColors.strikethrough) {
        css += `
        ${characterSelector} .mes_text s,
        ${characterSelector} .mes_text strike,
        ${characterSelector} .mes_text del {
            color: ${specificColors.strikethrough} !important;
        }
        `;
    } else if (colorMapping.strikethrough === 'primary') {
        css += `
        ${characterSelector} .mes_text s,
        ${characterSelector} .mes_text strike,
        ${characterSelector} .mes_text del {
            color: var(--csc-char-primary) !important;
        }
        `;
    } else if (colorMapping.strikethrough === 'secondary') {
        css += `
        ${characterSelector} .mes_text s,
        ${characterSelector} .mes_text strike,
        ${characterSelector} .mes_text del {
            color: var(--csc-char-secondary) !important;
        }
        `;
    }

    // Apply blockquote border color
    if (specificColors.blockquoteBorder) {
        css += `
        ${characterSelector} .mes_text blockquote {
            border-color: ${specificColors.blockquoteBorder} !important;
        }
        `;
    } else if (colorMapping.blockquoteBorder === 'primary') {
        css += `
        ${characterSelector} .mes_text blockquote {
            border-color: var(--csc-char-primary) !important;
        }
        `;
    } else if (colorMapping.blockquoteBorder === 'secondary') {
        css += `
        ${characterSelector} .mes_text blockquote {
            border-color: var(--csc-char-secondary) !important;
        }
        `;
    }

    // Apply links color
    if (specificColors.links) {
        css += `
        ${characterSelector} .mes_text a {
            color: ${specificColors.links} !important;
        }
        `;
    } else if (colorMapping.links === 'primary') {
        css += `
        ${characterSelector} .mes_text a {
            color: var(--csc-char-primary) !important;
        }
        `;
    } else if (colorMapping.links === 'secondary') {
        css += `
        ${characterSelector} .mes_text a {
            color: var(--csc-char-secondary) !important;
        }
        `;
    }

    // Apply links hover color
    if (specificColors.linksHover) {
        css += `
        ${characterSelector} .mes_text a:hover {
            color: ${specificColors.linksHover} !important;
        }
        `;
    } else if (colorMapping.linksHover === 'primary') {
        css += `
        ${characterSelector} .mes_text a:hover {
            color: var(--csc-char-primary) !important;
        }
        `;
    } else if (colorMapping.linksHover === 'secondary') {
        css += `
        ${characterSelector} .mes_text a:hover {
            color: var(--csc-char-secondary) !important;
        }
        `;
    }

    // Apply character-specific custom CSS only if enabled
    if (settings.enableCharacterCSS && characterConfig.customCSS) {
        css += `
        /* Custom CSS for ${characterId} messages */
        ${characterSelector} {
            ${characterConfig.customCSS}
        }
        `;
    }

    return css;
}

/**
 * Generate CSS for base global styles
 * @returns {string} Generated CSS
 */
function generateGlobalCSS() {
    const mainColors = settings.globalSettings.mainColors;
    const userColors = settings.userSettings.mainColors;
    const colorMapping = settings.globalSettings.colorMapping;

    // First define global CSS variables
    let css = `
    :root {
        --csc-primary: ${mainColors.primary};
        --csc-secondary: ${mainColors.secondary};
        --csc-bg-primary: ${mainColors.bgPrimary};
        --csc-bg-secondary: ${mainColors.bgSecondary};

        --csc-user-primary: ${userColors.primary};
        --csc-user-secondary: ${userColors.secondary};
        --csc-user-bg-primary: ${userColors.bgPrimary};
        --csc-user-bg-secondary: ${userColors.bgSecondary};
    }
    `;

    // Character message selector (non-user) with improved specificity
    const charSelector = `.mes:not([is_user="true"]):not([csc-author-uid])`;

    // Apply global styles based on mapping - only to messages without specific character UID

    // Character name color (always uses primary unless mapping changes)
    css += `
    ${charSelector} .name_text {
        color: var(--csc-primary) !important;
    }
    `;

    // Main text color mapping
    if (colorMapping.mainText === 'primary') {
        css += `
        ${charSelector} .mes_text {
            color: var(--csc-primary) !important;
        }
        `;
    } else if (colorMapping.mainText === 'secondary') {
        css += `
        ${charSelector} .mes_text {
            color: var(--csc-secondary) !important;
        }
        `;
    }

    // Quote text color mapping
    if (colorMapping.quotes === 'primary') {
        css += `
        ${charSelector} .mes_text q {
            color: var(--csc-primary) !important;
        }
        `;
    } else if (colorMapping.quotes === 'secondary') {
        css += `
        ${charSelector} .mes_text q {
            color: var(--csc-secondary) !important;
        }
        `;
    }

    // Bold text color mapping
    if (colorMapping.bold === 'primary') {
        css += `
        ${charSelector} .mes_text b,
        ${charSelector} .mes_text strong {
            color: var(--csc-primary) !important;
        }
        `;
    } else if (colorMapping.bold === 'secondary') {
        css += `
        ${charSelector} .mes_text b,
        ${charSelector} .mes_text strong {
            color: var(--csc-secondary) !important;
        }
        `;
    }

    // Italic text color mapping
    if (colorMapping.italic === 'primary') {
        css += `
        ${charSelector} .mes_text i,
        ${charSelector} .mes_text em {
            color: var(--csc-primary) !important;
        }
        `;
    } else if (colorMapping.italic === 'secondary') {
        css += `
        ${charSelector} .mes_text i,
        ${charSelector} .mes_text em {
            color: var(--csc-secondary) !important;
        }
        `;
    }

    // Bold+Italic text color mapping
    if (colorMapping.boldItalic === 'primary') {
        css += `
        ${charSelector} .mes_text b i,
        ${charSelector} .mes_text strong em,
        ${charSelector} .mes_text i b,
        ${charSelector} .mes_text em strong {
            color: var(--csc-primary) !important;
        }
        `;
    } else if (colorMapping.boldItalic === 'secondary') {
        css += `
        ${charSelector} .mes_text b i,
        ${charSelector} .mes_text strong em,
        ${charSelector} .mes_text i b,
        ${charSelector} .mes_text em strong {
            color: var(--csc-secondary) !important;
        }
        `;
    }

    // Underline text color mapping
    if (colorMapping.underline === 'primary') {
        css += `
        ${charSelector} .mes_text u {
            color: var(--csc-primary) !important;
        }
        `;
    } else if (colorMapping.underline === 'secondary') {
        css += `
        ${charSelector} .mes_text u {
            color: var(--csc-secondary) !important;
        }
        `;
    }

    // Strikethrough text color mapping
    if (colorMapping.strikethrough === 'primary') {
        css += `
        ${charSelector} .mes_text s,
        ${charSelector} .mes_text strike,
        ${charSelector} .mes_text del {
            color: var(--csc-primary) !important;
        }
        `;
    } else if (colorMapping.strikethrough === 'secondary') {
        css += `
        ${charSelector} .mes_text s,
        ${charSelector} .mes_text strike,
        ${charSelector} .mes_text del {
            color: var(--csc-secondary) !important;
        }
        `;
    }

    // Blockquote border color mapping
    if (colorMapping.blockquoteBorder === 'primary') {
        css += `
        ${charSelector} .mes_text blockquote {
            border-color: var(--csc-primary) !important;
        }
        `;
    } else if (colorMapping.blockquoteBorder === 'secondary') {
        css += `
        ${charSelector} .mes_text blockquote {
            border-color: var(--csc-secondary) !important;
        }
        `;
    }

    // Links color mapping
    if (colorMapping.links === 'primary') {
        css += `
        ${charSelector} .mes_text a {
            color: var(--csc-primary) !important;
        }
        `;
    } else if (colorMapping.links === 'secondary') {
        css += `
        ${charSelector} .mes_text a {
            color: var(--csc-secondary) !important;
        }
        `;
    }

    // Links hover color mapping
    if (colorMapping.linksHover === 'primary') {
        css += `
        ${charSelector} .mes_text a:hover {
            color: var(--csc-primary) !important;
        }
        `;
    } else if (colorMapping.linksHover === 'secondary') {
        css += `
        ${charSelector} .mes_text a:hover {
            color: var(--csc-secondary) !important;
        }
        `;
    }

    // User message styles - use Element Color Mapping with user colors
    const userSelector = `.mes[is_user="true"]`;

    // User name color - always use primary color
    css += `
    ${userSelector} .name_text {
        color: var(--csc-user-primary) !important;
    }
    `;

    // User main text color
    if (colorMapping.mainText === 'primary') {
        css += `
        ${userSelector} .mes_text {
            color: var(--csc-user-primary) !important;
        }
        `;
    } else if (colorMapping.mainText === 'secondary') {
        css += `
        ${userSelector} .mes_text {
            color: var(--csc-user-secondary) !important;
        }
        `;
    }

    // User bold text color
    if (colorMapping.bold === 'primary') {
        css += `
        ${userSelector} .mes_text b,
        ${userSelector} .mes_text strong {
            color: var(--csc-user-primary) !important;
        }
        `;
    } else if (colorMapping.bold === 'secondary') {
        css += `
        ${userSelector} .mes_text b,
        ${userSelector} .mes_text strong {
            color: var(--csc-user-secondary) !important;
        }
        `;
    }

    // User italic text color
    if (colorMapping.italic === 'primary') {
        css += `
        ${userSelector} .mes_text i,
        ${userSelector} .mes_text em {
            color: var(--csc-user-primary) !important;
        }
        `;
    } else if (colorMapping.italic === 'secondary') {
        css += `
        ${userSelector} .mes_text i,
        ${userSelector} .mes_text em {
            color: var(--csc-user-secondary) !important;
        }
        `;
    }

    // User bold+italic text color
    if (colorMapping.boldItalic === 'primary') {
        css += `
        ${userSelector} .mes_text b i,
        ${userSelector} .mes_text strong em,
        ${userSelector} .mes_text i b,
        ${userSelector} .mes_text em strong {
            color: var(--csc-user-primary) !important;
        }
        `;
    } else if (colorMapping.boldItalic === 'secondary') {
        css += `
        ${userSelector} .mes_text b i,
        ${userSelector} .mes_text strong em,
        ${userSelector} .mes_text i b,
        ${userSelector} .mes_text em strong {
            color: var(--csc-user-secondary) !important;
        }
        `;
    }

    // User quotes text color
    if (colorMapping.quotes === 'primary') {
        css += `
        ${userSelector} .mes_text q {
            color: var(--csc-user-primary) !important;
        }
        `;
    } else if (colorMapping.quotes === 'secondary') {
        css += `
        ${userSelector} .mes_text q {
            color: var(--csc-user-secondary) !important;
        }
        `;
    }

    // User underline text color
    if (colorMapping.underline === 'primary') {
        css += `
        ${userSelector} .mes_text u {
            color: var(--csc-user-primary) !important;
        }
        `;
    } else if (colorMapping.underline === 'secondary') {
        css += `
        ${userSelector} .mes_text u {
            color: var(--csc-user-secondary) !important;
        }
        `;
    }

    // User strikethrough text color
    if (colorMapping.strikethrough === 'primary') {
        css += `
        ${userSelector} .mes_text s,
        ${userSelector} .mes_text strike,
        ${userSelector} .mes_text del {
            color: var(--csc-user-primary) !important;
        }
        `;
    } else if (colorMapping.strikethrough === 'secondary') {
        css += `
        ${userSelector} .mes_text s,
        ${userSelector} .mes_text strike,
        ${userSelector} .mes_text del {
            color: var(--csc-user-secondary) !important;
        }
        `;
    }

    // User blockquote border color
    if (colorMapping.blockquoteBorder === 'primary') {
        css += `
        ${userSelector} .mes_text blockquote {
            border-color: var(--csc-user-primary) !important;
        }
        `;
    } else if (colorMapping.blockquoteBorder === 'secondary') {
        css += `
        ${userSelector} .mes_text blockquote {
            border-color: var(--csc-user-secondary) !important;
        }
        `;
    }

    // User links color
    if (colorMapping.links === 'primary') {
        css += `
        ${userSelector} .mes_text a {
            color: var(--csc-user-primary) !important;
        }
        `;
    } else if (colorMapping.links === 'secondary') {
        css += `
        ${userSelector} .mes_text a {
            color: var(--csc-user-secondary) !important;
        }
        `;
    }

    // User links hover color
    if (colorMapping.linksHover === 'primary') {
        css += `
        ${userSelector} .mes_text a:hover {
            color: var(--csc-user-primary) !important;
        }
        `;
    } else if (colorMapping.linksHover === 'secondary') {
        css += `
        ${userSelector} .mes_text a:hover {
            color: var(--csc-user-secondary) !important;
        }
        `;
    }

    return css;
}

// Apply global CSS for active character with enhanced logging
function applyGlobalCSS(characterId) {
    console.log(`[CSC] Applying global CSS for ${characterId}`);
    console.log(`[CSC] Settings enabled: ${settings.enabled}, Global CSS enabled: ${settings.enableGlobalCSS}`);

    if (!settings.enabled || !settings.enableGlobalCSS || !globalCssElement) {
        console.log('[CSC] Skipping global CSS application due to settings');
        return;
    }

    // Clear existing global CSS
    globalCssElement.textContent = '';

    // Remove all existing character-specific global CSS classes
    const oldClasses = document.body.className.match(/\bcsc-global-css-[^\s]+/g);
    if (oldClasses) {
        console.log('[CSC] Removing old global CSS classes:', oldClasses);
    }
    document.body.className = document.body.className.replace(/\bcsc-global-css-[^\s]+/g, '');

    // If no character is selected, or character has no settings, return
    if (!characterId || !settings.characterSettings[characterId]) {
        console.log(`[CSC] No settings found for character ${characterId}`);
        return;
    }

    // Check if global CSS is enabled for this character
    if (settings.characterSettings[characterId].enableGlobalCSS === false) {
        console.log(`[CSC] Global CSS disabled for character ${characterId}`);
        return;
    }

    // Get character's global CSS
    const globalCSS = settings.characterSettings[characterId].globalCSS;

    // If no global CSS, return
    if (!globalCSS) {
        console.log(`[CSC] No global CSS defined for character ${characterId}`);
        return;
    }

    // Generate a character-specific class name for the body
    const safeCharId = characterId.replace(/[|]/g, '-').replace(/\./g, '_');
    const className = `csc-global-css-${safeCharId}`;
    console.log(`[CSC] Adding global CSS class to body: ${className}`);

    // Apply the class to body
    document.body.classList.add(className);

    // Apply the global CSS
    globalCssElement.textContent = `/* Global CSS for ${characterId} */\n${globalCSS}`;
    console.log(`[CSC] Applied global CSS for ${characterId}`);
}

// Clear global CSS
function clearGlobalCSS() {
    console.log('[CSC] Clearing global CSS');
    if (globalCssElement) {
        globalCssElement.textContent = '';
    }

    // Remove any character-specific global CSS classes
    document.body.className = document.body.className.replace(/\bcsc-global-css-[^\s]+/g, '');
}

// Update preview style with real-time changes
function updatePreviewStyle(characterId) {
    if (!previewStyleElement || !characterId) {
        clearPreviewStyle();
        return;
    }

    console.log(`[CSC] Updating preview style for character: ${characterId}`);

    // Get current character settings from UI (not yet saved)
    const charConfig = {
        mainColors: {},
        specificColors: {},
        customCSS: '',
        globalCSS: '',
        enableGlobalCSS: true
    };

    // Start with any existing saved settings as a base
    if (settings.characterSettings[characterId]) {
        if (settings.characterSettings[characterId].mainColors) {
            Object.assign(charConfig.mainColors, settings.characterSettings[characterId].mainColors);
        }
        if (settings.characterSettings[characterId].specificColors) {
            Object.assign(charConfig.specificColors, settings.characterSettings[characterId].specificColors);
        }
        charConfig.customCSS = settings.characterSettings[characterId].customCSS || '';
        charConfig.globalCSS = settings.characterSettings[characterId].globalCSS || '';
        charConfig.enableGlobalCSS = settings.characterSettings[characterId].enableGlobalCSS !== false;
    }

    // Update custom CSS from textarea
    const customCssArea = document.getElementById('character-custom-css');
    if (customCssArea) {
        charConfig.customCSS = customCssArea.value;
    }

    // Update global CSS from textarea
    const globalCssArea = document.getElementById('character-global-css');
    if (globalCssArea) {
        charConfig.globalCSS = globalCssArea.value;
    }

    // Update global CSS toggle
    const enableGlobalCssCheckbox = document.getElementById('character-enable-global-css');
    if (enableGlobalCssCheckbox) {
        charConfig.enableGlobalCSS = enableGlobalCssCheckbox.checked;
    }

    // Update main colors from character settings tab
    getMainColorConfig().forEach(config => {
        // First try the character settings tab color pickers
        const mainColorInput = document.getElementById(`${config.id}-text`);
        if (mainColorInput && mainColorInput.value) {
            charConfig.mainColors[config.key] = mainColorInput.value;
        }
    });

    // Then check the card color pickers which may have different IDs
    getMainColorConfig().forEach(config => {
        const cardColorInput = document.getElementById(`card-color-${config.key}-text`);
        if (cardColorInput && cardColorInput.value) {
            charConfig.mainColors[config.key] = cardColorInput.value;
        }
    });

    // Also check persona color pickers
    getMainColorConfig().forEach(config => {
        const personaColorInput = document.getElementById(`persona-color-${config.key}-text`);
        if (personaColorInput && personaColorInput.value) {
            charConfig.mainColors[config.key] = personaColorInput.value;
        }
    });

    // Update specific colors from color pickers
    getColorMappingConfig().forEach(config => {
        const colorInput = document.getElementById(`char-specific-${config.key}-text`);
        if (colorInput && colorInput.value) {
            charConfig.specificColors[config.key] = colorInput.value;
        }
    });

    // Generate CSS for preview
    const previewCSS = generateCharacterCSS(characterId, charConfig);
    previewStyleElement.textContent = previewCSS;

    // If global CSS is enabled, also apply it for preview
    if (settings.enableGlobalCSS && charConfig.enableGlobalCSS !== false && charConfig.globalCSS) {
        applyGlobalCSS(characterId);
    }
}

// Clear preview style
function clearPreviewStyle() {
    if (previewStyleElement) {
        previewStyleElement.textContent = '';
    }
}

// Update main style with enhanced logging
function updateMainStyle() {
    console.log('[CSC] Updating main style');

    if (!mainStyleElement) {
        console.log('[CSC] Main style element not found');
        return;
    }

    if (!settings.enabled) {
        console.log('[CSC] Extension disabled, clearing styles');
        mainStyleElement.textContent = '';
        clearGlobalCSS();
        return;
    }

    let css = '';

    // First, apply global styles (lower priority)
    css += generateGlobalCSS();

    // Then apply character-specific styles (higher priority)
    for (const characterId in settings.characterSettings) {
        const characterConfig = settings.characterSettings[characterId];
        css += generateCharacterCSS(characterId, characterConfig, settings.globalSettings.colorMapping);
    }

    // Apply the CSS
    mainStyleElement.textContent = css;

    // Apply global CSS for currently selected character
    const currentChar = getCurrentCharacter();
    console.log('[CSC] Current character for global CSS:', currentChar);

    if (currentChar) {
        applyGlobalCSS(currentChar.id);
    } else {
        console.log('[CSC] No current character, clearing global CSS');
        clearGlobalCSS();
    }
}

// Listen for character editing events
function listenForCharacterEditing() {
    // Force recreation and update of character style options on character edit
    eventSource.on(event_types.EDIT_CHARACTER, () => {
        console.log('[CSC] Character edit detected');

        // Remove existing card option to ensure fresh creation
        const existingOption = document.getElementById('cs-card-option');
        if (existingOption) {
            existingOption.remove();
        }

        // Slight delay to ensure DOM is updated
        setTimeout(() => {
            addStyleOptionToCharacterCard();
        }, 200);
    });

    // Listen for character selection events
    eventSource.on(event_types.CHARACTER_SELECTED, () => {
        console.log('[CSC] Character selected, updating style options');

        // Remove existing card option to ensure fresh creation
        const existingOption = document.getElementById('cs-card-option');
        if (existingOption) {
            existingOption.remove();
        }

        // Apply global CSS for the selected character
        const currentChar = getCurrentCharacter();
        if (currentChar) {
            applyGlobalCSS(currentChar.id);
        } else {
            clearGlobalCSS();
        }

        // Slight delay to ensure DOM is updated
        setTimeout(() => {
            addStyleOptionToCharacterCard();
        }, 200);
    });

    // Also listen for clicks on characters in the character management UI
    document.addEventListener('click', function(e) {
        // Check if clicking a character in the character management
        const characterOption = e.target.closest('.character_select');
        if (characterOption) {
            console.log('[CSC] Character clicked in management panel');

            // Remove existing card option to ensure fresh creation
            const existingOption = document.getElementById('cs-card-option');
            if (existingOption) {
                existingOption.remove();
            }

            // Add new style option with a delay
            setTimeout(() => {
                addStyleOptionToCharacterCard();
            }, 300);
        }
    });
}

// Initialize the extension
function initExtension() {
    console.log(`Initializing ${EXTENSION_NAME} v${EXTENSION_VERSION}...`);

    // Setup persona change tracking
    setupPersonaChangeTracking();

    // Add character editing listener
    listenForCharacterEditing();

    // Initialize style sheets
    initializeStyleSheets();

    // Create settings UI
    createSettingsUI();

    // Set up message observer
    setupMessageObserver(updateMainStyle);

    // Process existing messages
    processAllMessages();

    // Listen for message added events
    cssEventSource.on(css_event_type.MESSAGE_ADDED, addAuthorUidToMessage);

    // Listen for chat change events
    eventSource.on(event_types.CHAT_CHANGED, () => {
        processAllMessages();
        updateMainStyle();
    });

    // Add character style customization option to character card
    addStyleOptionToCharacterCard();

    // Add style customization for user personas
    addStyleOptionToUserPersona();

    // Apply initial styles
    updateMainStyle();

    // Initialize full screen editor
    initFullScreenEditor();

    console.log(`${EXTENSION_NAME} v${EXTENSION_VERSION} initialized`);
}

// jQuery initialization
jQuery(function() {
    // Initialize extension
    initExtension();
});
