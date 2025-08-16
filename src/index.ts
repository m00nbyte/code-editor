declare module 'monaco-editor' {
    namespace editor {
        interface IStandaloneEditorConstructionOptions {
            value?: string;
            language?: string;
            theme?: string;
            automaticLayout?: boolean;
            minimap?: { enabled: boolean };
            fontSize?: number;
            scrollBeyondLastLine?: boolean;
            renderWhitespace?: string;
            wordWrap?: string;
        }

        interface IStandaloneCodeEditor {
            getValue(): string;
            setValue(value: string): string;
            layout(): void;
            onDidChangeModelContent(listener: () => void): void;
        }

        function create(domElement: HTMLElement, options: IStandaloneEditorConstructionOptions): IStandaloneCodeEditor;
    }
}

interface Window {
    monaco: typeof import('monaco-editor');
}

interface MonacoLoader {
    config: (config: { paths: { vs: string } }) => void;
    (deps: string[], callback: (monaco: typeof import('monaco-editor')) => void): void;
}

declare const JSZip: {
    new (): {
        file: (filename: string, content: string) => void;
        generateAsync: (options: { type: 'blob' }) => Promise<Blob>;
    };
};

/**
 * A comprehensive code editor application using Monaco Editor with HTML, CSS, and JavaScript support.
 */
class CodeEditor {
    static DEFAULT_CODE = {
        html: `<!-- Add your HTML here -->`,
        css: `/* Add your CSS here */`,
        js: `// Add your JavaScript here`
    };

    private editors: {
        html: import('monaco-editor').editor.IStandaloneCodeEditor;
        css: import('monaco-editor').editor.IStandaloneCodeEditor;
        js: import('monaco-editor').editor.IStandaloneCodeEditor;
    } | null = null;

    private codeState = {
        html: localStorage.getItem('html-code') || CodeEditor.DEFAULT_CODE.html,
        css: localStorage.getItem('css-code') || CodeEditor.DEFAULT_CODE.css,
        js: localStorage.getItem('js-code') || CodeEditor.DEFAULT_CODE.js
    };

    private editorArea!: HTMLElement;
    private preview!: HTMLIFrameElement;
    private tabButtons!: NodeListOf<HTMLElement>;
    private deviceButtons!: NodeListOf<HTMLElement>;
    private refreshButton!: HTMLElement;
    private downloadButton!: HTMLElement;
    private resetButton!: HTMLElement;
    private editorContainers!: {
        html: HTMLDivElement;
        css: HTMLDivElement;
        js: HTMLDivElement;
        ext: HTMLDivElement;
    };
    private externalResources: { url: string; type: 'css' | 'js' }[] = JSON.parse(
        localStorage.getItem('external-resources') || '[]'
    );

    constructor() {
        this.codeState = {
            html: localStorage.getItem('html-code') || CodeEditor.DEFAULT_CODE.html,
            css: localStorage.getItem('css-code') || CodeEditor.DEFAULT_CODE.css,
            js: localStorage.getItem('js-code') || CodeEditor.DEFAULT_CODE.js
        };

        this.initMonaco();
        this.initDOM();
        this.initExternal();
        this.initEventListeners();
    }

    private initMonaco(): void {
        const loader = (window as any).require as MonacoLoader;
        loader.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.50.0/min/vs' } });
        loader(['vs/editor/editor.main'], () => this.setupEditors());
    }

    private initDOM(): void {
        this.editorArea = document.getElementById('editor-container') as HTMLDivElement;
        this.preview = document.getElementById('preview') as HTMLIFrameElement;
        this.tabButtons = document.querySelectorAll('.tab') as NodeListOf<HTMLElement>;
        this.deviceButtons = document.querySelectorAll('.device-btn') as NodeListOf<HTMLElement>;
        this.refreshButton = document.getElementById('refresh-button') as HTMLElement;
        this.downloadButton = document.getElementById('download-button') as HTMLElement;
        this.resetButton = document.getElementById('reset-button') as HTMLElement;

        this.editorContainers = {
            html: this.createEditorContainer('html', true),
            css: this.createEditorContainer('css', false),
            js: this.createEditorContainer('js', false),
            ext: this.createEditorContainer('ext', false)
        };

        Object.values(this.editorContainers).forEach((container) => this.editorArea.appendChild(container));
    }

    private createEditorContainer(language: 'html' | 'css' | 'js' | 'ext', isActive: boolean): HTMLDivElement {
        const container = document.createElement('div');
        container.className = `editor-container ${isActive ? 'bg-stone-700' : ''}`;
        container.id = `${language}-editor`;
        container.style.display = isActive ? 'block' : 'none';
        return container;
    }

    private setupEditors(): void {
        if (!window.monaco) {
            console.error('Monaco Editor not loaded');
            return;
        }

        const editorOptions: import('monaco-editor').editor.IStandaloneEditorConstructionOptions = {
            theme: 'vs-dark',
            automaticLayout: true,
            minimap: { enabled: false },
            fontSize: 14,
            scrollBeyondLastLine: false,
            renderWhitespace: 'selection',
            wordWrap: 'on'
        };

        this.editors = {
            html: window.monaco.editor.create(this.editorContainers.html, {
                ...editorOptions,
                value: this.codeState.html,
                language: 'html'
            }),
            css: window.monaco.editor.create(this.editorContainers.css, {
                ...editorOptions,
                value: this.codeState.css,
                language: 'css'
            }),
            js: window.monaco.editor.create(this.editorContainers.js, {
                ...editorOptions,
                value: this.codeState.js,
                language: 'javascript'
            })
        };

        Object.values(this.editors).forEach((editor) => {
            editor.onDidChangeModelContent(this.debounce(() => this.updatePreview(), 500));
        });

        this.updatePreview();
    }

    private handleResize(): void {
        if (!this.editors) return;
        Object.values(this.editors).forEach((editor) => editor.layout());
    }

    private debounce<F extends (...args: any[]) => void>(func: F, delay: number): (...args: Parameters<F>) => void {
        let timeout: number;
        return (...args: Parameters<F>) => {
            window.clearTimeout(timeout);
            timeout = window.setTimeout(() => func.apply(this, args), delay);
        };
    }

    private switchLanguage(language: 'html' | 'css' | 'js' | 'ext'): void {
        if (!this.editorContainers) return;

        this.tabButtons.forEach((btn) => btn.classList.remove('bg-stone-700'));
        document.querySelector(`.tab[data-code="${language}"]`)?.classList.add('bg-stone-700');

        Object.entries(this.editorContainers).forEach(([lang, container]) => {
            container.style.display = lang === language ? 'block' : 'none';
        });

        if (language === 'ext') {
            this.editorArea.classList.add('overflow-scroll');
            this.editorArea.classList.add('lg:overflow-hidden');
        } else {
            this.editorArea.classList.remove('overflow-scroll');
            this.editorArea.classList.remove('lg:overflow-hidden');

            requestAnimationFrame(() => {
                this.editors?.[language]?.layout();
            });
        }
    }

    private setDeviceView(device: 'mobile' | 'tablet' | 'desktop'): void {
        // Update active button state
        this.deviceButtons.forEach((btn) => {
            if (btn.dataset.device === device) {
                btn.classList.remove('text-stone-600');
                btn.classList.add('text-white');
            } else {
                btn.classList.remove('text-white');
                btn.classList.add('text-stone-600');
            }
        });

        // Update iframe styling based on device
        switch (device) {
            case 'mobile':
                this.preview.style.maxWidth = '375px';
                this.preview.style.margin = '0 auto';
                this.preview.style.borderRadius = '20px';
                this.preview.style.border = '10px solid #000';
                break;
            case 'tablet':
                this.preview.style.maxWidth = '768px';
                this.preview.style.margin = '0 auto';
                this.preview.style.borderRadius = '10px';
                this.preview.style.border = '8px solid #000';
                break;
            case 'desktop':
                this.preview.style.maxWidth = '100%';
                this.preview.style.width = '100%';
                this.preview.style.margin = '0';
                this.preview.style.borderRadius = '0';
                this.preview.style.border = 'none';
                break;
        }

        // Trigger resize to update layout
        setTimeout(() => {
            this.handleResize();
        }, 100);
    }

    private updatePreview(): void {
        if (!this.editors) return;

        this.saveCodeToState();
        this.saveToLocalStorage();

        const overlay = document.getElementById('overlay');
        overlay?.classList.remove('opacity-0');

        this.refreshButton.classList.add('animate-spin');

        // Generate link tags for CSS
        const cssLinks = this.externalResources
            .filter((res) => res.type === 'css')
            .map((res) => `<link rel="stylesheet" href="${res.url}">`)
            .join('\n');

        // Generate script tags for JS
        const jsScripts = this.externalResources
            .filter((res) => res.type === 'js')
            .map((res) => `<script src="${res.url}"></script>`)
            .join('\n');

        const combined = `<!DOCTYPE html>
            <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Code Project</title>
                    ${cssLinks}
                    <style>${this.codeState.css}</style>
                </head>
                <body>
                    ${this.codeState.html}
                    ${jsScripts}
                    <script>${this.codeState.js}</script>
                </body>
            </html>`;

        this.preview.srcdoc = combined;

        setTimeout(() => {
            overlay?.classList.add('opacity-0');
            this.refreshButton.classList.remove('animate-spin');
        }, 500);
    }

    private async addExternalResource(url: string): Promise<void> {
        const errorElement = document.getElementById('external-error');

        if (!url) {
            errorElement!.textContent = 'Please enter a URL';
            errorElement!.classList.remove('hidden');
            return;
        }

        // Basic URL validation
        try {
            new URL(url);
        } catch (e) {
            errorElement!.textContent = 'Please enter a valid URL (e.g., https://example.com/style.css)';
            errorElement!.classList.remove('hidden');
            return;
        }

        // Check if URL already exists
        if (this.externalResources.some((res) => res.url === url)) {
            errorElement!.textContent = 'This resource is already added';
            errorElement!.classList.remove('hidden');
            return;
        }

        // Check resource type
        const type = await this.checkResourceType(url);
        if (type === 'unknown') {
            errorElement!.textContent =
                'Could not determine resource type. Please make sure the URL points to a CSS or JavaScript file.';
            errorElement!.classList.remove('hidden');
            return;
        }

        // Clear any previous errors
        errorElement!.classList.add('hidden');

        // Add to resources
        this.externalResources.push({ url, type });
        this.saveExternalResources();
        this.updateExternal();
        this.updatePreview();
    }

    private removeExternalResource(url: string): void {
        this.externalResources = this.externalResources.filter((res) => res.url !== url);
        this.saveExternalResources();
        this.updateExternal();
        this.updatePreview();
    }

    private saveExternalResources(): void {
        localStorage.setItem('external-resources', JSON.stringify(this.externalResources));
    }

    private initExternal(): void {
        const container = document.getElementById('ext-editor');
        if (!container) return;

        container.innerHTML = `<div class="flex flex-col gap-4 p-4">
            <div class="flex gap-2">
                <input
                    type="text"
                    placeholder="https://example.com/style.css"
                    id="external-url-input"
                    class="block w-full appearance-none border border-stone-800 px-3 py-2 placeholder-stone-400 focus:z-10 focus:outline-none focus:ring-stone-800 bg-stone-800 text-white"
                />
                <button
                    id="add-external-btn"
                    class="bg-emerald-700 px-4 py-2 text-white hover:bg-emerald-600 transition-all flex items-center gap-2 disabled:bg-stone-800 disabled:cursor-wait"
                >
                    <span id="add-external-text">Add</span>
                    <div id="add-external-spinner" class="i-[line-md-loading-loop] hidden"></div>
                </button>
            </div>
            <div id="external-error" class="text-rose-500 text-sm hidden"></div>
            <div id="external-scripts" class="flex flex-col gap-2"></div>
        </div>`;

        this.updateExternal();

        // Add external resource
        document.getElementById('add-external-btn')?.addEventListener('click', async (event: MouseEvent) => {
            const button = event.target as HTMLButtonElement;
            const input = document.getElementById('external-url-input') as HTMLInputElement;
            const url = input.value.trim();
            input.disabled = true;
            button.disabled = true;

            const spinner = document.getElementById('add-external-spinner');
            spinner?.classList.remove('hidden');

            const text = document.getElementById('add-external-text');
            text?.classList.add('hidden');

            try {
                await this.addExternalResource(url);
                input.value = '';
            } catch (error) {
                console.error('Error adding resource:', error);
            } finally {
                spinner?.classList.add('hidden');
                text?.classList.remove('hidden');

                input.disabled = false;
                button.disabled = false;
                input.focus();
            }
        });

        // Also update the Enter key handler to be async
        document.getElementById('external-url-input')?.addEventListener('keypress', async (e) => {
            if (e.key === 'Enter') {
                const input = e.target as HTMLInputElement;
                input.disabled = true;

                const spinner = document.getElementById('add-external-spinner');
                spinner?.classList.remove('hidden');

                try {
                    await this.addExternalResource(input.value.trim());
                    input.value = '';
                } catch (error) {
                    console.error('Error adding resource:', error);
                } finally {
                    spinner?.classList.add('hidden');

                    input.disabled = false;
                }
            }
        });

        document.getElementById('external-url-input')?.addEventListener('input', () => {
            const errorElement = document.getElementById('external-error');
            errorElement?.classList.add('hidden');
        });

        // Remove external resource
        document.getElementById('external-scripts')?.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            const copyBtn = target.closest('.copy-external-url');
            if (copyBtn) {
                const url = copyBtn.getAttribute('data-url');
                if (url) {
                    navigator.clipboard
                        .writeText(url)
                        .then(() => {
                            copyBtn.classList.remove('border-b');
                            copyBtn.classList.remove('border-dashed');
                            copyBtn.classList.remove('cursor-pointer');
                            const originalText = copyBtn.textContent;
                            copyBtn.textContent = 'Copied!';
                            setTimeout(() => {
                                copyBtn.classList.add('border-b');
                                copyBtn.classList.add('border-dashed');
                                copyBtn.classList.add('cursor-pointer');
                                copyBtn.textContent = originalText;
                            }, 1500);
                        })
                        .catch((err) => {
                            console.error('Copy failed:', err);
                        });
                }
            }
            const removeBtn = target.closest('.remove-external-btn');
            if (removeBtn) {
                const url = removeBtn.getAttribute('data-url');
                if (url) this.removeExternalResource(url);
            }
        });
    }

    private truncateUrl(url: string): string {
        const maxLength = 60;
        if (url.length <= maxLength) return url;

        // Parse the URL (fallback to simple string splitting if URL parsing fails)
        let protocol = '';
        let domain = '';
        let path = '';
        let filename = '';

        try {
            const urlObj = new URL(url);
            protocol = urlObj.protocol + '//';
            domain = urlObj.hostname;
            path = urlObj.pathname;

            // Extract filename (last part after last slash)
            const lastSlash = path.lastIndexOf('/');
            filename = lastSlash >= 0 ? path.slice(lastSlash + 1) : '';
        } catch {
            // Fallback for malformed URLs
            const parts = url.split('/');
            protocol = parts[0] + (parts.length > 1 ? '//' : '');
            domain = parts[2] || '';
            filename = parts[parts.length - 1] || '';
        }

        // If we have both domain and filename
        if (domain && filename) {
            const base = `${protocol}${domain}`;
            const remainingSpace = maxLength - base.length - filename.length - 3; // 3 for '/.../'

            if (remainingSpace >= 0) {
                return `${base}/.../${filename}`;
            }

            // If even the domain + filename is too long, truncate filename
            if (base.length + filename.length > maxLength) {
                const truncatedFilename = `...${filename.slice(-(maxLength - base.length - 3))}`;
                return `${base}/${truncatedFilename}`;
            }
        }

        // Fallback for URLs without clear structure
        const ellipsis = '...';
        const start = url.slice(0, Math.floor(maxLength * 0.6) - ellipsis.length);
        const end = url.slice(-(maxLength - start.length - ellipsis.length));
        return `${start}${ellipsis}${end}`;
    }

    private async checkResourceType(url: string): Promise<'css' | 'js' | 'unknown'> {
        try {
            // First check the extension as a quick check
            const fileExtension = ['css', 'js'].find((item) => url.endsWith(`.${item}`)) as 'css' | 'js' | null;

            if (fileExtension) {
                return fileExtension;
            }

            // If extension doesn't tell us, make a HEAD request
            const response = await fetch(url, { method: 'HEAD' });
            const contentType = response.headers.get('content-type');

            console.log(contentType);
            if (contentType?.includes('text/css')) return 'css';
            if (contentType?.includes('javascript')) return 'js';

            return 'unknown';
        } catch (error) {
            console.error('Failed to check resource type:', error);
            return 'unknown';
        }
    }

    private updateExternal(): void {
        const container = document.getElementById('external-scripts');
        if (!container) return;

        container.innerHTML = this.externalResources
            .map(
                (res) => `
                    <div class="flex items-center justify-between p-2 bg-stone-800">
                        <div class="flex flex-row gap-2 truncate items-center">
                            <div class="${
                                res.type === 'css'
                                    ? 'i-[devicon-css3]'
                                    : res.type === 'js'
                                    ? 'i-[devicon-javascript]'
                                    : 'i-[carbon-unknown-filled]'
                            } ml-2 flex-shrink-0"></div>
                            <span class="text-sm border-b border-dashed cursor-pointer copy-external-url" title="${
                                res.url
                            }" data-url="${res.url}">${this.truncateUrl(res.url)}</span>
                        </div>
                        <button
                            class="p-2 hover:text-rose-500 transition-all remove-external-btn"
                            data-url="${res.url}"
                        >
                            <div class="i-[mdi-delete] text-stone-400 hover:text-rose-600"></div>
                        </button>
                    </div>`
            )
            .join('');
    }

    private resetEditors(): void {
        if (!this.editors) return;

        this.editors.html.setValue(CodeEditor.DEFAULT_CODE.html);
        this.editors.css.setValue(CodeEditor.DEFAULT_CODE.css);
        this.editors.js.setValue(CodeEditor.DEFAULT_CODE.js);

        // Clear external resources
        this.externalResources = [];
        this.saveExternalResources();
        this.updateExternal();

        localStorage.removeItem('html-code');
        localStorage.removeItem('css-code');
        localStorage.removeItem('js-code');

        this.codeState = {
            html: CodeEditor.DEFAULT_CODE.html,
            css: CodeEditor.DEFAULT_CODE.css,
            js: CodeEditor.DEFAULT_CODE.js
        };

        this.updatePreview();
    }

    private saveCodeToState(): void {
        if (!this.editors) return;

        this.codeState = {
            html: this.editors.html.getValue(),
            css: this.editors.css.getValue(),
            js: this.editors.js.getValue()
        };
    }

    private saveToLocalStorage(): void {
        localStorage.setItem('html-code', this.codeState.html);
        localStorage.setItem('css-code', this.codeState.css);
        localStorage.setItem('js-code', this.codeState.js);
    }

    private generateCompleteHTML(): string {
        // Generate link tags for CSS
        const cssLinks = this.externalResources
            .filter((res) => res.type === 'css')
            .map((res) => `<link rel="stylesheet" href="${res.url}">`)
            .join('\n');

        // Generate script tags for JS
        const jsScripts = this.externalResources
            .filter((res) => res.type === 'js')
            .map((res) => `<script src="${res.url}"></script>`)
            .join('\n');

        return `<!DOCTYPE html>
    <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Code Project</title>
            ${cssLinks}
            <link rel="stylesheet" href="styles.css">
        </head>
        <body>
            ${this.codeState.html}
            ${jsScripts}
            <script src="script.js"></script>
        </body>
    </html>`;
    }

    private async downloadProject(): Promise<void> {
        this.saveCodeToState();

        const zip = new JSZip();
        zip.file('index.html', this.generateCompleteHTML());
        zip.file('styles.css', this.codeState.css);
        zip.file('script.js', this.codeState.js);

        const content = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(content);

        const a = document.createElement('a');
        a.href = url;
        a.className = 'hidden';
        a.download = 'code-project.zip';

        document.body.appendChild(a);
        a.click();

        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);
    }

    private initEventListeners(): void {
        this.tabButtons.forEach((tab) => {
            tab.addEventListener('click', () => {
                const language = tab.dataset.code as 'html' | 'css' | 'js' | 'ext';
                this.switchLanguage(language);
            });
        });

        this.deviceButtons.forEach((btn) => {
            btn.addEventListener('click', () => {
                const device = btn.dataset.device as 'mobile' | 'tablet' | 'desktop';
                this.setDeviceView(device);
            });
        });

        this.refreshButton.addEventListener('click', () => {
            this.updatePreview();
        });

        this.downloadButton.addEventListener('click', () => {
            this.downloadProject().catch(console.error);
        });

        this.resetButton.addEventListener('click', () => {
            this.resetEditors();
        });

        document.addEventListener('keydown', (event) => {
            if (event.ctrlKey && event.key === 's') {
                event.preventDefault();

                this.downloadProject().catch(console.error);
            }
        });

        window.addEventListener('resize', () => this.handleResize());

        window.addEventListener('beforeunload', (event) => {
            event.preventDefault();
            return '';
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new CodeEditor();
});
