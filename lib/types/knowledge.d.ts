/** Directory containing the bundled knowledge modules. */
export declare const knowledgeDir: string;
/** Topic keys (file basenames without .md) available to tools and skills. */
export declare const KNOWLEDGE_TOPICS: readonly string[];
export declare function listKnowledgeModules(): Promise<string[]>;
/** Load one knowledge module verbatim. */
export declare function loadKnowledgeModule(topic: string): Promise<string>;
/** Case-insensitive search across all modules; returns line-matched excerpts. */
export declare function searchKnowledgeModules(query: string): Promise<Array<{
    topic: string;
    line: number;
    text: string;
}>>;
