import { setupServer } from 'msw/node';
import { handlers, refreshHandlers } from './handlers';

export const server = setupServer(...handlers, ...refreshHandlers);
