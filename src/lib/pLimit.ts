// p-limit clone
 
type Fn<Arguments extends unknown[], ReturnType> = (...args: Arguments) => PromiseLike<ReturnType> | ReturnType;
type Resolve<T> = (value: T | PromiseLike<T>) => void;

class Node<ValueType> {
	value: ValueType;
	next: Node<ValueType> | undefined;

	constructor(value: ValueType) {
		this.value = value;
	}
}

class Queue<ValueType> {
	private _head?: Node<ValueType>;
	private _tail?: Node<ValueType>;
	private _size!: number;

	constructor() {
		this.clear();
	}

	enqueue(value: ValueType): void {
		const node = new Node(value);

		if (this._head) {
			this._tail!.next = node;
			this._tail = node;
		} else {
			this._head = node;
			this._tail = node;
		}

		this._size++;
	}

	dequeue(): ValueType | undefined {
		const current = this._head;
		if (!current) {
			return;
		}

		this._head = current.next;
		this._size--;
		return current.value;
	}

	clear(): void {
		this._head = undefined;
		this._tail = undefined;
		this._size = 0;
	}

	get size(): number {
		return this._size;
	}

	* [Symbol.iterator](): IterableIterator<ValueType> {
		let current = this._head;

		while (current) {
			yield current.value;
			current = current.next;
		}
	}
}

export interface PLimit {
	<Arguments extends unknown[], ReturnType>(
		fn: Fn<Arguments, ReturnType>,
		...args: Arguments
	): Promise<ReturnType>;

	readonly activeCount: number;
	readonly pendingCount: number;
	clearQueue(): void;
	concurrency: number;
}

export default function pLimit(concurrency: number): PLimit {
	validateConcurrency(concurrency);

	const queue = new Queue<() => Promise<void>>();
	let activeCount = 0;

	const resumeNext = (): void => {
		if (activeCount < concurrency && queue.size > 0) {
			const task = queue.dequeue()!;
			activeCount++;
			task();
		}
	};

	const next = (): void => {
		activeCount--;
		resumeNext();
	};

	const run = async <Arguments extends unknown[], ReturnType>(
		function_: Fn<Arguments, ReturnType>,
		resolve: Resolve<ReturnType>,
		arguments_: Arguments,
	): Promise<void> => {
		const result = (async () => function_(...arguments_))();
		resolve(result);

		try {
			await result;
		} catch {}

		next();
	};

	const enqueue = <Arguments extends unknown[], ReturnType>(
		function_: Fn<Arguments, ReturnType>,
		resolve: Resolve<ReturnType>,
		arguments_: Arguments,
	): void => {
		const task = async () => run(function_, resolve, arguments_);

		queue.enqueue(task);

		(async () => {
			await Promise.resolve();
			if (activeCount < concurrency) {
				resumeNext();
			}
		})();
	};

	const generator = <Arguments extends unknown[], ReturnType>(
		function_: Fn<Arguments, ReturnType>,
		...arguments_: Arguments
	): Promise<ReturnType> =>
		new Promise(resolve => {
			enqueue(function_, resolve, arguments_);
		});

	Object.defineProperties(generator, {
		activeCount: {
			get: () => activeCount,
		},
		pendingCount: {
			get: () => queue.size,
		},
		clearQueue: {
			value: () => {
				queue.clear();
			},
		},
		concurrency: {
			get: () => concurrency,
			set(newConcurrency: number) {
				validateConcurrency(newConcurrency);
				concurrency = newConcurrency;

				queueMicrotask(() => {
					while (activeCount < concurrency && queue.size > 0) {
						resumeNext();
					}
				});
			},
		},
	});

	return generator as PLimit;
}

export function limitFunction<Arguments extends unknown[], ReturnType>(
	function_: Fn<Arguments, ReturnType>,
	option: {concurrency: number},
): Fn<Arguments, Promise<ReturnType>> {
	const {concurrency} = option;
	const limit = pLimit(concurrency);

	return (...arguments_: Arguments) => limit(() => function_(...arguments_));
}

function validateConcurrency(concurrency: unknown): void {
	if (
		!(
			(Number.isInteger(concurrency) ||
				concurrency === Number.POSITIVE_INFINITY) &&
			(concurrency as number) > 0
		)
	) {
		throw new TypeError(
			'Expected `concurrency` to be a number from 1 and up',
		);
	}
}
