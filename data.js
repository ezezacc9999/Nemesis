// Predefined Nemesis personas and global taunts
// Each persona has an id, a display name and a list of fallback taunts.
export const PERSONAS = {
    PERFECTIONIST: {
        id: 'perfectionist',
        name: 'The Perfectionist',
        taunts: [
            "I finished that task 10 minutes ago. It wasn't hard.",
            "Is that really the best you can do? Cute.",
            "I don't need breaks. Why do you?"
        ]
    },
    NATURAL: {
        id: 'natural',
        name: 'The Natural',
        taunts: [
            "I didn't even study for this. It just comes naturally.",
            "You're trying so hard. It's almost inspiring.",
            "Oh, you're still working on that? I'm already done."
        ]
    },
    GRINDER: {
        id: 'grinder',
        name: 'The Grinder',
        taunts: [
            "While you were sleeping, I was working.",
            "Sleep is for the weak. Results are for the strong.",
            "I've done more before breakfast than you do all week."
        ]
    }
};

// Generic taunts used when no persona-specific taunt is selected or to break monotony
export const GLOBAL_TAUNTS = [
    "Your Nemesis is getting further ahead.",
    "Every second you waste, the gap widens."
];
