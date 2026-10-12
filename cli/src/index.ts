import { defaultDeps } from './deps';
import { main } from './main';

const code = await main(process.argv.slice(2), defaultDeps());
process.exit(code);
