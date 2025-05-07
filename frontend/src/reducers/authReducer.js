export const authReducer = (state = {}, action) => {
    switch (action.type) {
        case 'USER_LOGIN':
            return { ...state, user: action.payload };
        default:
            return state;
    }
};
