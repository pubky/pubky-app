// @vitest-environment node
import { createMemoryStore } from './memoryStore';
import { describeIndexStoreContract, type Payload } from './store.contract';

describeIndexStoreContract('memory', () => createMemoryStore<Payload>());
