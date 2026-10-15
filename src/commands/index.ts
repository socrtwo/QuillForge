/** Registers every command module. Import once at startup. */
import './file';
import './edit';
import './format';
import './insert';
import './draw';
import './layout';
import './references';
import './mailings';
import './review';
import './view';
import './developer';
import './table';
import './picture';
import './tools';
import './ai';
export { allCommands, getCommand, commandCount, searchCommands } from './registry';
