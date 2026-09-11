const ACCESS_CONTROL = {

    doctor: {
        name: "Doctor",
        allowedSection: "medical",
        icon: "🩺"
    },

    police: {
        name: "Police Officer",
        allowedSection: "criminal",
        icon: "👮"
    },

    educator: {
        name: "Educator",
        allowedSection: "academic",
        icon: "🎓"
    },

    civilian: {
        name: "Civilian",
        allowedSection: "civilian",
        icon: "👤"
    }

};


export function getAccessForRole(role) {

    return ACCESS_CONTROL[role] || null;

}


export function getRoleName(role) {

    if (
        ACCESS_CONTROL[role]
    ) {

        return ACCESS_CONTROL[role].name;

    }

    return "Unknown";

}
