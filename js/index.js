/* Porta de entrada: decide entre dashboard e login. */

import { getSession, HOME_PAGE, LOGIN_PAGE } from './auth.js';

const session = await getSession();

window.location.replace(session ? HOME_PAGE : LOGIN_PAGE);
