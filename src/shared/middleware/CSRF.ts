import csrf from "csurf";

export const csrfProtection = csrf({
  cookie: {
    key: "_csrf",
    httpOnly: true,
    secure: true,
    sameSite: "none",
    path: "/",
  },
});
