(function () {
    'use strict';

    function noop() { }
    function assign(tar, src) {
        // @ts-ignore
        for (const k in src)
            tar[k] = src[k];
        return tar;
    }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }
    function is_empty(obj) {
        return Object.keys(obj).length === 0;
    }
    function subscribe$1(store, ...callbacks) {
        if (store == null) {
            return noop;
        }
        const unsub = store.subscribe(...callbacks);
        return unsub.unsubscribe ? () => unsub.unsubscribe() : unsub;
    }
    function component_subscribe(component, store, callback) {
        component.$$.on_destroy.push(subscribe$1(store, callback));
    }
    function create_slot(definition, ctx, $$scope, fn) {
        if (definition) {
            const slot_ctx = get_slot_context(definition, ctx, $$scope, fn);
            return definition[0](slot_ctx);
        }
    }
    function get_slot_context(definition, ctx, $$scope, fn) {
        return definition[1] && fn
            ? assign($$scope.ctx.slice(), definition[1](fn(ctx)))
            : $$scope.ctx;
    }
    function get_slot_changes(definition, $$scope, dirty, fn) {
        if (definition[2] && fn) {
            const lets = definition[2](fn(dirty));
            if ($$scope.dirty === undefined) {
                return lets;
            }
            if (typeof lets === 'object') {
                const merged = [];
                const len = Math.max($$scope.dirty.length, lets.length);
                for (let i = 0; i < len; i += 1) {
                    merged[i] = $$scope.dirty[i] | lets[i];
                }
                return merged;
            }
            return $$scope.dirty | lets;
        }
        return $$scope.dirty;
    }
    function update_slot(slot, slot_definition, ctx, $$scope, dirty, get_slot_changes_fn, get_slot_context_fn) {
        const slot_changes = get_slot_changes(slot_definition, $$scope, dirty, get_slot_changes_fn);
        if (slot_changes) {
            const slot_context = get_slot_context(slot_definition, ctx, $$scope, get_slot_context_fn);
            slot.p(slot_context, slot_changes);
        }
    }
    function action_destroyer(action_result) {
        return action_result && is_function(action_result.destroy) ? action_result.destroy : noop;
    }

    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        node.parentNode.removeChild(node);
    }
    function destroy_each(iterations, detaching) {
        for (let i = 0; i < iterations.length; i += 1) {
            if (iterations[i])
                iterations[i].d(detaching);
        }
    }
    function element(name) {
        return document.createElement(name);
    }
    function svg_element(name) {
        return document.createElementNS('http://www.w3.org/2000/svg', name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function empty() {
        return text('');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function prevent_default(fn) {
        return function (event) {
            event.preventDefault();
            // @ts-ignore
            return fn.call(this, event);
        };
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function to_number(value) {
        return value === '' ? null : +value;
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function set_data(text, data) {
        data = '' + data;
        if (text.wholeText !== data)
            text.data = data;
    }
    function set_input_value(input, value) {
        input.value = value == null ? '' : value;
    }
    function set_style(node, key, value, important) {
        node.style.setProperty(key, value, important ? 'important' : '');
    }
    function toggle_class(element, name, toggle) {
        element.classList[toggle ? 'add' : 'remove'](name);
    }
    function custom_event(type, detail) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, false, false, detail);
        return e;
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }
    function get_current_component() {
        if (!current_component)
            throw new Error('Function called outside component initialization');
        return current_component;
    }
    function onMount(fn) {
        get_current_component().$$.on_mount.push(fn);
    }
    function afterUpdate(fn) {
        get_current_component().$$.after_update.push(fn);
    }
    function createEventDispatcher() {
        const component = get_current_component();
        return (type, detail) => {
            const callbacks = component.$$.callbacks[type];
            if (callbacks) {
                // TODO are there situations where events could be dispatched
                // in a server (non-DOM) environment?
                const event = custom_event(type, detail);
                callbacks.slice().forEach(fn => {
                    fn.call(component, event);
                });
            }
        };
    }
    // TODO figure out if we still want to support
    // shorthand events, or if we want to implement
    // a real bubbling mechanism
    function bubble(component, event) {
        const callbacks = component.$$.callbacks[event.type];
        if (callbacks) {
            callbacks.slice().forEach(fn => fn(event));
        }
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function tick() {
        schedule_update();
        return resolved_promise;
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    function add_flush_callback(fn) {
        flush_callbacks.push(fn);
    }
    let flushing = false;
    const seen_callbacks = new Set();
    function flush() {
        if (flushing)
            return;
        flushing = true;
        do {
            // first, call beforeUpdate functions
            // and update components
            for (let i = 0; i < dirty_components.length; i += 1) {
                const component = dirty_components[i];
                set_current_component(component);
                update$1(component.$$);
            }
            set_current_component(null);
            dirty_components.length = 0;
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                    callback();
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
        flushing = false;
        seen_callbacks.clear();
    }
    function update$1($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }
    const outroing = new Set();
    let outros;
    function group_outros() {
        outros = {
            r: 0,
            c: [],
            p: outros // parent group
        };
    }
    function check_outros() {
        if (!outros.r) {
            run_all(outros.c);
        }
        outros = outros.p;
    }
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function transition_out(block, local, detach, callback) {
        if (block && block.o) {
            if (outroing.has(block))
                return;
            outroing.add(block);
            outros.c.push(() => {
                outroing.delete(block);
                if (callback) {
                    if (detach)
                        block.d(1);
                    callback();
                }
            });
            block.o(local);
        }
    }

    function get_spread_update(levels, updates) {
        const update = {};
        const to_null_out = {};
        const accounted_for = { $$scope: 1 };
        let i = levels.length;
        while (i--) {
            const o = levels[i];
            const n = updates[i];
            if (n) {
                for (const key in o) {
                    if (!(key in n))
                        to_null_out[key] = 1;
                }
                for (const key in n) {
                    if (!accounted_for[key]) {
                        update[key] = n[key];
                        accounted_for[key] = 1;
                    }
                }
                levels[i] = n;
            }
            else {
                for (const key in o) {
                    accounted_for[key] = 1;
                }
            }
        }
        for (const key in to_null_out) {
            if (!(key in update))
                update[key] = undefined;
        }
        return update;
    }
    function get_spread_object(spread_props) {
        return typeof spread_props === 'object' && spread_props !== null ? spread_props : {};
    }

    function bind(component, name, callback) {
        const index = component.$$.props[name];
        if (index !== undefined) {
            component.$$.bound[index] = callback;
            callback(component.$$.ctx[index]);
        }
    }
    function create_component(block) {
        block && block.c();
    }
    function mount_component(component, target, anchor, customElement) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        if (!customElement) {
            // onMount happens before the initial afterUpdate
            add_render_callback(() => {
                const new_on_destroy = on_mount.map(run).filter(is_function);
                if (on_destroy) {
                    on_destroy.push(...new_on_destroy);
                }
                else {
                    // Edge case - component was destroyed immediately,
                    // most likely as a result of a binding initialising
                    run_all(new_on_destroy);
                }
                component.$$.on_mount = [];
            });
        }
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            on_disconnect: [],
            before_update: [],
            after_update: [],
            context: new Map(parent_component ? parent_component.$$.context : []),
            // everything else
            callbacks: blank_object(),
            dirty,
            skip_bound: false
        };
        let ready = false;
        $$.ctx = instance
            ? instance(component, options.props || {}, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if (!$$.skip_bound && $$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                const nodes = children(options.target);
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(nodes);
                nodes.forEach(detach);
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor, options.customElement);
            flush();
        }
        set_current_component(parent_component);
    }
    /**
     * Base class for Svelte components. Used when dev=false.
     */
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set($$props) {
            if (this.$$set && !is_empty($$props)) {
                this.$$.skip_bound = true;
                this.$$set($$props);
                this.$$.skip_bound = false;
            }
        }
    }

    const subscriber_queue = [];
    /**
     * Creates a `Readable` store that allows reading by subscription.
     * @param value initial value
     * @param {StartStopNotifier}start start and stop notifications for subscriptions
     */
    function readable(value, start) {
        return {
            subscribe: writable(value, start).subscribe
        };
    }
    /**
     * Create a `Writable` store that allows both updating and reading by subscription.
     * @param {*=}value initial value
     * @param {StartStopNotifier=}start start and stop notifications for subscriptions
     */
    function writable(value, start = noop) {
        let stop;
        const subscribers = [];
        function set(new_value) {
            if (safe_not_equal(value, new_value)) {
                value = new_value;
                if (stop) { // store is ready
                    const run_queue = !subscriber_queue.length;
                    for (let i = 0; i < subscribers.length; i += 1) {
                        const s = subscribers[i];
                        s[1]();
                        subscriber_queue.push(s, value);
                    }
                    if (run_queue) {
                        for (let i = 0; i < subscriber_queue.length; i += 2) {
                            subscriber_queue[i][0](subscriber_queue[i + 1]);
                        }
                        subscriber_queue.length = 0;
                    }
                }
            }
        }
        function update(fn) {
            set(fn(value));
        }
        function subscribe(run, invalidate = noop) {
            const subscriber = [run, invalidate];
            subscribers.push(subscriber);
            if (subscribers.length === 1) {
                stop = start(set) || noop;
            }
            run(value);
            return () => {
                const index = subscribers.indexOf(subscriber);
                if (index !== -1) {
                    subscribers.splice(index, 1);
                }
                if (subscribers.length === 0) {
                    stop();
                    stop = null;
                }
            };
        }
        return { set, update, subscribe };
    }
    function derived(stores, fn, initial_value) {
        const single = !Array.isArray(stores);
        const stores_array = single
            ? [stores]
            : stores;
        const auto = fn.length < 2;
        return readable(initial_value, (set) => {
            let inited = false;
            const values = [];
            let pending = 0;
            let cleanup = noop;
            const sync = () => {
                if (pending) {
                    return;
                }
                cleanup();
                const result = fn(single ? values[0] : values, set);
                if (auto) {
                    set(result);
                }
                else {
                    cleanup = is_function(result) ? result : noop;
                }
            };
            const unsubscribers = stores_array.map((store, i) => subscribe$1(store, (value) => {
                values[i] = value;
                pending &= ~(1 << i);
                if (inited) {
                    sync();
                }
            }, () => {
                pending |= (1 << i);
            }));
            inited = true;
            sync();
            return function stop() {
                run_all(unsubscribers);
                cleanup();
            };
        });
    }

    function regexparam (str, loose) {
    	if (str instanceof RegExp) return { keys:false, pattern:str };
    	var c, o, tmp, ext, keys=[], pattern='', arr = str.split('/');
    	arr[0] || arr.shift();

    	while (tmp = arr.shift()) {
    		c = tmp[0];
    		if (c === '*') {
    			keys.push('wild');
    			pattern += '/(.*)';
    		} else if (c === ':') {
    			o = tmp.indexOf('?', 1);
    			ext = tmp.indexOf('.', 1);
    			keys.push( tmp.substring(1, !!~o ? o : !!~ext ? ext : tmp.length) );
    			pattern += !!~o && !~ext ? '(?:/([^/]+?))?' : '/([^/]+?)';
    			if (!!~ext) pattern += (!!~o ? '?' : '') + '\\' + tmp.substring(ext);
    		} else {
    			pattern += '/' + tmp;
    		}
    	}

    	return {
    		keys: keys,
    		pattern: new RegExp('^' + pattern + (loose ? '(?=$|\/)' : '\/?$'), 'i')
    	};
    }

    /* node_modules/svelte-spa-router/Router.svelte generated by Svelte v3.35.0 */

    function create_else_block$1(ctx) {
    	let switch_instance;
    	let switch_instance_anchor;
    	let current;
    	const switch_instance_spread_levels = [/*props*/ ctx[2]];
    	var switch_value = /*component*/ ctx[0];

    	function switch_props(ctx) {
    		let switch_instance_props = {};

    		for (let i = 0; i < switch_instance_spread_levels.length; i += 1) {
    			switch_instance_props = assign(switch_instance_props, switch_instance_spread_levels[i]);
    		}

    		return { props: switch_instance_props };
    	}

    	if (switch_value) {
    		switch_instance = new switch_value(switch_props());
    		switch_instance.$on("routeEvent", /*routeEvent_handler_1*/ ctx[7]);
    	}

    	return {
    		c() {
    			if (switch_instance) create_component(switch_instance.$$.fragment);
    			switch_instance_anchor = empty();
    		},
    		m(target, anchor) {
    			if (switch_instance) {
    				mount_component(switch_instance, target, anchor);
    			}

    			insert(target, switch_instance_anchor, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const switch_instance_changes = (dirty & /*props*/ 4)
    			? get_spread_update(switch_instance_spread_levels, [get_spread_object(/*props*/ ctx[2])])
    			: {};

    			if (switch_value !== (switch_value = /*component*/ ctx[0])) {
    				if (switch_instance) {
    					group_outros();
    					const old_component = switch_instance;

    					transition_out(old_component.$$.fragment, 1, 0, () => {
    						destroy_component(old_component, 1);
    					});

    					check_outros();
    				}

    				if (switch_value) {
    					switch_instance = new switch_value(switch_props());
    					switch_instance.$on("routeEvent", /*routeEvent_handler_1*/ ctx[7]);
    					create_component(switch_instance.$$.fragment);
    					transition_in(switch_instance.$$.fragment, 1);
    					mount_component(switch_instance, switch_instance_anchor.parentNode, switch_instance_anchor);
    				} else {
    					switch_instance = null;
    				}
    			} else if (switch_value) {
    				switch_instance.$set(switch_instance_changes);
    			}
    		},
    		i(local) {
    			if (current) return;
    			if (switch_instance) transition_in(switch_instance.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			if (switch_instance) transition_out(switch_instance.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(switch_instance_anchor);
    			if (switch_instance) destroy_component(switch_instance, detaching);
    		}
    	};
    }

    // (202:0) {#if componentParams}
    function create_if_block$9(ctx) {
    	let switch_instance;
    	let switch_instance_anchor;
    	let current;
    	const switch_instance_spread_levels = [{ params: /*componentParams*/ ctx[1] }, /*props*/ ctx[2]];
    	var switch_value = /*component*/ ctx[0];

    	function switch_props(ctx) {
    		let switch_instance_props = {};

    		for (let i = 0; i < switch_instance_spread_levels.length; i += 1) {
    			switch_instance_props = assign(switch_instance_props, switch_instance_spread_levels[i]);
    		}

    		return { props: switch_instance_props };
    	}

    	if (switch_value) {
    		switch_instance = new switch_value(switch_props());
    		switch_instance.$on("routeEvent", /*routeEvent_handler*/ ctx[6]);
    	}

    	return {
    		c() {
    			if (switch_instance) create_component(switch_instance.$$.fragment);
    			switch_instance_anchor = empty();
    		},
    		m(target, anchor) {
    			if (switch_instance) {
    				mount_component(switch_instance, target, anchor);
    			}

    			insert(target, switch_instance_anchor, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const switch_instance_changes = (dirty & /*componentParams, props*/ 6)
    			? get_spread_update(switch_instance_spread_levels, [
    					dirty & /*componentParams*/ 2 && { params: /*componentParams*/ ctx[1] },
    					dirty & /*props*/ 4 && get_spread_object(/*props*/ ctx[2])
    				])
    			: {};

    			if (switch_value !== (switch_value = /*component*/ ctx[0])) {
    				if (switch_instance) {
    					group_outros();
    					const old_component = switch_instance;

    					transition_out(old_component.$$.fragment, 1, 0, () => {
    						destroy_component(old_component, 1);
    					});

    					check_outros();
    				}

    				if (switch_value) {
    					switch_instance = new switch_value(switch_props());
    					switch_instance.$on("routeEvent", /*routeEvent_handler*/ ctx[6]);
    					create_component(switch_instance.$$.fragment);
    					transition_in(switch_instance.$$.fragment, 1);
    					mount_component(switch_instance, switch_instance_anchor.parentNode, switch_instance_anchor);
    				} else {
    					switch_instance = null;
    				}
    			} else if (switch_value) {
    				switch_instance.$set(switch_instance_changes);
    			}
    		},
    		i(local) {
    			if (current) return;
    			if (switch_instance) transition_in(switch_instance.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			if (switch_instance) transition_out(switch_instance.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(switch_instance_anchor);
    			if (switch_instance) destroy_component(switch_instance, detaching);
    		}
    	};
    }

    function create_fragment$k(ctx) {
    	let current_block_type_index;
    	let if_block;
    	let if_block_anchor;
    	let current;
    	const if_block_creators = [create_if_block$9, create_else_block$1];
    	const if_blocks = [];

    	function select_block_type(ctx, dirty) {
    		if (/*componentParams*/ ctx[1]) return 0;
    		return 1;
    	}

    	current_block_type_index = select_block_type(ctx);
    	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

    	return {
    		c() {
    			if_block.c();
    			if_block_anchor = empty();
    		},
    		m(target, anchor) {
    			if_blocks[current_block_type_index].m(target, anchor);
    			insert(target, if_block_anchor, anchor);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type(ctx);

    			if (current_block_type_index === previous_block_index) {
    				if_blocks[current_block_type_index].p(ctx, dirty);
    			} else {
    				group_outros();

    				transition_out(if_blocks[previous_block_index], 1, 1, () => {
    					if_blocks[previous_block_index] = null;
    				});

    				check_outros();
    				if_block = if_blocks[current_block_type_index];

    				if (!if_block) {
    					if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block.c();
    				} else {
    					if_block.p(ctx, dirty);
    				}

    				transition_in(if_block, 1);
    				if_block.m(if_block_anchor.parentNode, if_block_anchor);
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d(detaching) {
    			if_blocks[current_block_type_index].d(detaching);
    			if (detaching) detach(if_block_anchor);
    		}
    	};
    }

    /**
     * @typedef {Object} Location
     * @property {string} location - Location (page/view), for example `/book`
     * @property {string} [querystring] - Querystring from the hash, as a string not parsed
     */
    /**
     * Returns the current location from the hash.
     *
     * @returns {Location} Location object
     * @private
     */
    function getLocation() {
    	const hashPosition = window.location.href.indexOf("#/");

    	let location = hashPosition > -1
    	? window.location.href.substr(hashPosition + 1)
    	: "/";

    	// Check if there's a querystring
    	const qsPosition = location.indexOf("?");

    	let querystring = "";

    	if (qsPosition > -1) {
    		querystring = location.substr(qsPosition + 1);
    		location = location.substr(0, qsPosition);
    	}

    	return { location, querystring };
    }

    const loc = readable(null, // eslint-disable-next-line prefer-arrow-callback
    function start(set) {
    	set(getLocation());

    	const update = () => {
    		set(getLocation());
    	};

    	window.addEventListener("hashchange", update, false);

    	return function stop() {
    		window.removeEventListener("hashchange", update, false);
    	};
    });

    derived(loc, $loc => $loc.location);
    derived(loc, $loc => $loc.querystring);

    async function push(location) {
    	if (!location || location.length < 1 || location.charAt(0) != "/" && location.indexOf("#/") !== 0) {
    		throw Error("Invalid parameter location");
    	}

    	// Execute this code when the current call stack is complete
    	await tick();

    	// Note: this will include scroll state in history even when restoreScrollState is false
    	history.replaceState(
    		{
    			scrollX: window.scrollX,
    			scrollY: window.scrollY
    		},
    		undefined,
    		undefined
    	);

    	window.location.hash = (location.charAt(0) == "#" ? "" : "#") + location;
    }

    async function replace(location) {
    	if (!location || location.length < 1 || location.charAt(0) != "/" && location.indexOf("#/") !== 0) {
    		throw Error("Invalid parameter location");
    	}

    	// Execute this code when the current call stack is complete
    	await tick();

    	const dest = (location.charAt(0) == "#" ? "" : "#") + location;

    	try {
    		window.history.replaceState(undefined, undefined, dest);
    	} catch(e) {
    		// eslint-disable-next-line no-console
    		console.warn("Caught exception while replacing the current page. If you're running this in the Svelte REPL, please note that the `replace` method might not work in this environment.");
    	}

    	// The method above doesn't trigger the hashchange event, so let's do that manually
    	window.dispatchEvent(new Event("hashchange"));
    }

    function instance$m($$self, $$props, $$invalidate) {
    	let { routes = {} } = $$props;
    	let { prefix = "" } = $$props;
    	let { restoreScrollState = false } = $$props;

    	/**
     * Container for a route: path, component
     */
    	class RouteItem {
    		/**
     * Initializes the object and creates a regular expression from the path, using regexparam.
     *
     * @param {string} path - Path to the route (must start with '/' or '*')
     * @param {SvelteComponent|WrappedComponent} component - Svelte component for the route, optionally wrapped
     */
    		constructor(path, component) {
    			if (!component || typeof component != "function" && (typeof component != "object" || component._sveltesparouter !== true)) {
    				throw Error("Invalid component object");
    			}

    			// Path must be a regular or expression, or a string starting with '/' or '*'
    			if (!path || typeof path == "string" && (path.length < 1 || path.charAt(0) != "/" && path.charAt(0) != "*") || typeof path == "object" && !(path instanceof RegExp)) {
    				throw Error("Invalid value for \"path\" argument - strings must start with / or *");
    			}

    			const { pattern, keys } = regexparam(path);
    			this.path = path;

    			// Check if the component is wrapped and we have conditions
    			if (typeof component == "object" && component._sveltesparouter === true) {
    				this.component = component.component;
    				this.conditions = component.conditions || [];
    				this.userData = component.userData;
    				this.props = component.props || {};
    			} else {
    				// Convert the component to a function that returns a Promise, to normalize it
    				this.component = () => Promise.resolve(component);

    				this.conditions = [];
    				this.props = {};
    			}

    			this._pattern = pattern;
    			this._keys = keys;
    		}

    		/**
     * Checks if `path` matches the current route.
     * If there's a match, will return the list of parameters from the URL (if any).
     * In case of no match, the method will return `null`.
     *
     * @param {string} path - Path to test
     * @returns {null|Object.<string, string>} List of paramters from the URL if there's a match, or `null` otherwise.
     */
    		match(path) {
    			// If there's a prefix, check if it matches the start of the path.
    			// If not, bail early, else remove it before we run the matching.
    			if (prefix) {
    				if (typeof prefix == "string") {
    					if (path.startsWith(prefix)) {
    						path = path.substr(prefix.length) || "/";
    					} else {
    						return null;
    					}
    				} else if (prefix instanceof RegExp) {
    					const match = path.match(prefix);

    					if (match && match[0]) {
    						path = path.substr(match[0].length) || "/";
    					} else {
    						return null;
    					}
    				}
    			}

    			// Check if the pattern matches
    			const matches = this._pattern.exec(path);

    			if (matches === null) {
    				return null;
    			}

    			// If the input was a regular expression, this._keys would be false, so return matches as is
    			if (this._keys === false) {
    				return matches;
    			}

    			const out = {};
    			let i = 0;

    			while (i < this._keys.length) {
    				// In the match parameters, URL-decode all values
    				try {
    					out[this._keys[i]] = decodeURIComponent(matches[i + 1] || "") || null;
    				} catch(e) {
    					out[this._keys[i]] = null;
    				}

    				i++;
    			}

    			return out;
    		}

    		/**
     * Dictionary with route details passed to the pre-conditions functions, as well as the `routeLoading`, `routeLoaded` and `conditionsFailed` events
     * @typedef {Object} RouteDetail
     * @property {string|RegExp} route - Route matched as defined in the route definition (could be a string or a reguar expression object)
     * @property {string} location - Location path
     * @property {string} querystring - Querystring from the hash
     * @property {object} [userData] - Custom data passed by the user
     * @property {SvelteComponent} [component] - Svelte component (only in `routeLoaded` events)
     * @property {string} [name] - Name of the Svelte component (only in `routeLoaded` events)
     */
    		/**
     * Executes all conditions (if any) to control whether the route can be shown. Conditions are executed in the order they are defined, and if a condition fails, the following ones aren't executed.
     * 
     * @param {RouteDetail} detail - Route detail
     * @returns {bool} Returns true if all the conditions succeeded
     */
    		async checkConditions(detail) {
    			for (let i = 0; i < this.conditions.length; i++) {
    				if (!await this.conditions[i](detail)) {
    					return false;
    				}
    			}

    			return true;
    		}
    	}

    	// Set up all routes
    	const routesList = [];

    	if (routes instanceof Map) {
    		// If it's a map, iterate on it right away
    		routes.forEach((route, path) => {
    			routesList.push(new RouteItem(path, route));
    		});
    	} else {
    		// We have an object, so iterate on its own properties
    		Object.keys(routes).forEach(path => {
    			routesList.push(new RouteItem(path, routes[path]));
    		});
    	}

    	// Props for the component to render
    	let component = null;

    	let componentParams = null;
    	let props = {};

    	// Event dispatcher from Svelte
    	const dispatch = createEventDispatcher();

    	// Just like dispatch, but executes on the next iteration of the event loop
    	async function dispatchNextTick(name, detail) {
    		// Execute this code when the current call stack is complete
    		await tick();

    		dispatch(name, detail);
    	}

    	// If this is set, then that means we have popped into this var the state of our last scroll position
    	let previousScrollState = null;

    	if (restoreScrollState) {
    		window.addEventListener("popstate", event => {
    			// If this event was from our history.replaceState, event.state will contain
    			// our scroll history. Otherwise, event.state will be null (like on forward
    			// navigation)
    			if (event.state && event.state.scrollY) {
    				previousScrollState = event.state;
    			} else {
    				previousScrollState = null;
    			}
    		});

    		afterUpdate(() => {
    			// If this exists, then this is a back navigation: restore the scroll position
    			if (previousScrollState) {
    				window.scrollTo(previousScrollState.scrollX, previousScrollState.scrollY);
    			} else {
    				// Otherwise this is a forward navigation: scroll to top
    				window.scrollTo(0, 0);
    			}
    		});
    	}

    	// Always have the latest value of loc
    	let lastLoc = null;

    	// Current object of the component loaded
    	let componentObj = null;

    	// Handle hash change events
    	// Listen to changes in the $loc store and update the page
    	// Do not use the $: syntax because it gets triggered by too many things
    	loc.subscribe(async newLoc => {
    		lastLoc = newLoc;

    		// Find a route matching the location
    		let i = 0;

    		while (i < routesList.length) {
    			const match = routesList[i].match(newLoc.location);

    			if (!match) {
    				i++;
    				continue;
    			}

    			const detail = {
    				route: routesList[i].path,
    				location: newLoc.location,
    				querystring: newLoc.querystring,
    				userData: routesList[i].userData
    			};

    			// Check if the route can be loaded - if all conditions succeed
    			if (!await routesList[i].checkConditions(detail)) {
    				// Don't display anything
    				$$invalidate(0, component = null);

    				componentObj = null;

    				// Trigger an event to notify the user, then exit
    				dispatchNextTick("conditionsFailed", detail);

    				return;
    			}

    			// Trigger an event to alert that we're loading the route
    			// We need to clone the object on every event invocation so we don't risk the object to be modified in the next tick
    			dispatchNextTick("routeLoading", Object.assign({}, detail));

    			// If there's a component to show while we're loading the route, display it
    			const obj = routesList[i].component;

    			// Do not replace the component if we're loading the same one as before, to avoid the route being unmounted and re-mounted
    			if (componentObj != obj) {
    				if (obj.loading) {
    					$$invalidate(0, component = obj.loading);
    					componentObj = obj;
    					$$invalidate(1, componentParams = obj.loadingParams);
    					$$invalidate(2, props = {});

    					// Trigger the routeLoaded event for the loading component
    					// Create a copy of detail so we don't modify the object for the dynamic route (and the dynamic route doesn't modify our object too)
    					dispatchNextTick("routeLoaded", Object.assign({}, detail, { component, name: component.name }));
    				} else {
    					$$invalidate(0, component = null);
    					componentObj = null;
    				}

    				// Invoke the Promise
    				const loaded = await obj();

    				// Now that we're here, after the promise resolved, check if we still want this component, as the user might have navigated to another page in the meanwhile
    				if (newLoc != lastLoc) {
    					// Don't update the component, just exit
    					return;
    				}

    				// If there is a "default" property, which is used by async routes, then pick that
    				$$invalidate(0, component = loaded && loaded.default || loaded);

    				componentObj = obj;
    			}

    			// Set componentParams only if we have a match, to avoid a warning similar to `<Component> was created with unknown prop 'params'`
    			// Of course, this assumes that developers always add a "params" prop when they are expecting parameters
    			if (match && typeof match == "object" && Object.keys(match).length) {
    				$$invalidate(1, componentParams = match);
    			} else {
    				$$invalidate(1, componentParams = null);
    			}

    			// Set static props, if any
    			$$invalidate(2, props = routesList[i].props);

    			// Dispatch the routeLoaded event then exit
    			// We need to clone the object on every event invocation so we don't risk the object to be modified in the next tick
    			dispatchNextTick("routeLoaded", Object.assign({}, detail, { component, name: component.name }));

    			return;
    		}

    		// If we're still here, there was no match, so show the empty component
    		$$invalidate(0, component = null);

    		componentObj = null;
    	});

    	function routeEvent_handler(event) {
    		bubble($$self, event);
    	}

    	function routeEvent_handler_1(event) {
    		bubble($$self, event);
    	}

    	$$self.$$set = $$props => {
    		if ("routes" in $$props) $$invalidate(3, routes = $$props.routes);
    		if ("prefix" in $$props) $$invalidate(4, prefix = $$props.prefix);
    		if ("restoreScrollState" in $$props) $$invalidate(5, restoreScrollState = $$props.restoreScrollState);
    	};

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*restoreScrollState*/ 32) {
    			// Update history.scrollRestoration depending on restoreScrollState
    			history.scrollRestoration = restoreScrollState ? "manual" : "auto";
    		}
    	};

    	return [
    		component,
    		componentParams,
    		props,
    		routes,
    		prefix,
    		restoreScrollState,
    		routeEvent_handler,
    		routeEvent_handler_1
    	];
    }

    class Router extends SvelteComponent {
    	constructor(options) {
    		super();

    		init(this, options, instance$m, create_fragment$k, safe_not_equal, {
    			routes: 3,
    			prefix: 4,
    			restoreScrollState: 5
    		});
    	}
    }

    function get(key, defaultResult) {
        if (!localStorage.hasOwnProperty(key)) {
            return defaultResult;
        }

        return JSON.parse(localStorage.getItem(key))
    }

    function save$1(key, data) {
        localStorage.setItem(key, JSON.stringify(data));
    }

    function rm(key) {
        localStorage.removeItem(key);
    }

    function getApiServer() {
        const apiServer = document.querySelector('meta[name="api.server"]');
        return apiServer ? apiServer.content : "https://learnalist.net";
    }

    const KeySettingsServer = "settings.server";
    const KeySettingsInstallDefaults = "settings.install.defaults";
    const KeyUserUuid = "app.user.uuid";
    const KeyUserAuthentication = "app.user.authentication";
    const KeyNotifications = "app.notifications";
    const KeyEditorMyEditedLists = "my.edited.lists";
    const KeyEditorMyLists = "my.lists";

    function clear() {
      localStorage.clear();
      save$1(KeySettingsInstallDefaults, true);
      save$1(KeySettingsServer, getApiServer());
      save$1(KeyEditorMyEditedLists, []);
      save$1(KeyEditorMyLists, []);
    }

    const clearConfiguration = clear;
    const saveConfiguration = save$1;
    const removeConfiguration = rm;
    const getConfiguration = get;

    function copyObject(item) {
        return JSON.parse(JSON.stringify(item))
    }

    const data = {
        level: "",
        message: "",
        sticky: false,
    };

    const emptyData$1 = JSON.parse(JSON.stringify(data));
    let liveData = JSON.parse(JSON.stringify(data));


    const storedData = getConfiguration(KeyNotifications, null);

    if (storedData !== null) {
        liveData = storedData;
    }

    const { subscribe, update, set } = writable(liveData);

    function wrapper() {
        return {
            subscribe,

            add: (level, message, sticky) => {
                if (sticky == undefined) {
                    sticky = false;
                }

                update(notification => {
                    notification.level = level;
                    notification.message = message;
                    notification.sticky = sticky;
                    saveConfiguration(KeyNotifications, notification);
                    return notification;
                });
            },

            clear: () => {
                removeConfiguration(KeyNotifications);
                set(copyObject(emptyData$1));
            }
        };
    }

    const notifications = wrapper();

    /*! *****************************************************************************
    Copyright (c) Microsoft Corporation.

    Permission to use, copy, modify, and/or distribute this software for any
    purpose with or without fee is hereby granted.

    THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
    REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
    AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
    INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
    LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
    OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
    PERFORMANCE OF THIS SOFTWARE.
    ***************************************************************************** */

    function __awaiter(thisArg, _arguments, P, generator) {
        function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
        return new (P || (P = Promise))(function (resolve, reject) {
            function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
            function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
            function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
            step((generator = generator.apply(thisArg, _arguments || [])).next());
        });
    }

    const BASE_PATH = "https://learnalist.net/api/v1".replace(/\/+$/, "");
    const isBlob = (value) => typeof Blob !== 'undefined' && value instanceof Blob;
    class BaseAPI {
        constructor(configuration = new Configuration()) {
            this.configuration = configuration;
            this.fetchApi = (url, init) => __awaiter(this, void 0, void 0, function* () {
                let fetchParams = { url, init };
                for (const middleware of this.middleware) {
                    if (middleware.pre) {
                        fetchParams = (yield middleware.pre(Object.assign({ fetch: this.fetchApi }, fetchParams))) || fetchParams;
                    }
                }
                let response = yield this.configuration.fetchApi(fetchParams.url, fetchParams.init);
                for (const middleware of this.middleware) {
                    if (middleware.post) {
                        response = (yield middleware.post({
                            fetch: this.fetchApi,
                            url,
                            init,
                            response: response.clone(),
                        })) || response;
                    }
                }
                return response;
            });
            this.middleware = configuration.middleware;
        }
        withMiddleware(...middlewares) {
            const next = this.clone();
            next.middleware = next.middleware.concat(...middlewares);
            return next;
        }
        withPreMiddleware(...preMiddlewares) {
            const middlewares = preMiddlewares.map((pre) => ({ pre }));
            return this.withMiddleware(...middlewares);
        }
        withPostMiddleware(...postMiddlewares) {
            const middlewares = postMiddlewares.map((post) => ({ post }));
            return this.withMiddleware(...middlewares);
        }
        request(context) {
            return __awaiter(this, void 0, void 0, function* () {
                const { url, init } = this.createFetchParams(context);
                const response = yield this.fetchApi(url, init);
                if (response.status >= 200 && response.status < 300) {
                    return response;
                }
                throw response;
            });
        }
        createFetchParams(context) {
            let url = this.configuration.basePath + context.path;
            if (context.query !== undefined && Object.keys(context.query).length !== 0) {
                url += '?' + this.configuration.queryParamsStringify(context.query);
            }
            const body = ((typeof FormData !== "undefined" && context.body instanceof FormData) || context.body instanceof URLSearchParams || isBlob(context.body))
                ? context.body
                : JSON.stringify(context.body);
            const headers = Object.assign({}, this.configuration.headers, context.headers);
            const init = {
                method: context.method,
                headers: headers,
                body,
                credentials: this.configuration.credentials
            };
            return { url, init };
        }
        clone() {
            const constructor = this.constructor;
            const next = new constructor(this.configuration);
            next.middleware = this.middleware.slice();
            return next;
        }
    }
    class RequiredError extends Error {
        constructor(field, msg) {
            super(msg);
            this.field = field;
            this.name = "RequiredError";
        }
    }
    class Configuration {
        constructor(configuration = {}) {
            this.configuration = configuration;
        }
        get basePath() {
            return this.configuration.basePath != null ? this.configuration.basePath : BASE_PATH;
        }
        get fetchApi() {
            return this.configuration.fetchApi || window.fetch.bind(window);
        }
        get middleware() {
            return this.configuration.middleware || [];
        }
        get queryParamsStringify() {
            return this.configuration.queryParamsStringify || querystring;
        }
        get username() {
            return this.configuration.username;
        }
        get password() {
            return this.configuration.password;
        }
        get apiKey() {
            const apiKey = this.configuration.apiKey;
            if (apiKey) {
                return typeof apiKey === 'function' ? apiKey : () => apiKey;
            }
            return undefined;
        }
        get accessToken() {
            const accessToken = this.configuration.accessToken;
            if (accessToken) {
                return typeof accessToken === 'function' ? accessToken : () => accessToken;
            }
            return undefined;
        }
        get headers() {
            return this.configuration.headers;
        }
        get credentials() {
            return this.configuration.credentials;
        }
    }
    function exists(json, key) {
        const value = json[key];
        return value !== null && value !== undefined;
    }
    function querystring(params, prefix = '') {
        return Object.keys(params)
            .map((key) => {
            const fullKey = prefix + (prefix.length ? `[${key}]` : key);
            const value = params[key];
            if (value instanceof Array) {
                const multiValue = value.map(singleValue => encodeURIComponent(String(singleValue)))
                    .join(`&${encodeURIComponent(fullKey)}=`);
                return `${encodeURIComponent(fullKey)}=${multiValue}`;
            }
            if (value instanceof Object) {
                return querystring(value, fullKey);
            }
            return `${encodeURIComponent(fullKey)}=${encodeURIComponent(String(value))}`;
        })
            .filter(part => part.length > 0)
            .join('&');
    }
    class JSONApiResponse {
        constructor(raw, transformer = (jsonValue) => jsonValue) {
            this.raw = raw;
            this.transformer = transformer;
        }
        value() {
            return __awaiter(this, void 0, void 0, function* () {
                return this.transformer(yield this.raw.json());
            });
        }
    }
    class VoidApiResponse {
        constructor(raw) {
            this.raw = raw;
        }
        value() {
            return __awaiter(this, void 0, void 0, function* () {
                return undefined;
            });
        }
    }

    function AlistFromJSON(json) {
        return AlistFromJSONTyped(json);
    }
    function AlistFromJSONTyped(json, ignoreDiscriminator) {
        if ((json === undefined) || (json === null)) {
            return json;
        }
        return {
            'uuid': json['uuid'],
            'info': AlistInfoFromJSON(json['info']),
            'data': AnyTypeFromJSON(json['data']),
        };
    }
    function AlistToJSON(value) {
        if (value === undefined) {
            return undefined;
        }
        if (value === null) {
            return null;
        }
        return {
            'uuid': value.uuid,
            'info': AlistInfoToJSON(value.info),
            'data': AnyTypeToJSON(value.data),
        };
    }

    function AlistFromFromJSON(json) {
        return AlistFromFromJSONTyped(json);
    }
    function AlistFromFromJSONTyped(json, ignoreDiscriminator) {
        if ((json === undefined) || (json === null)) {
            return json;
        }
        return {
            'kind': json['kind'],
            'ext_uuid': json['ext_uuid'],
            'ref_url': json['ref_url'],
        };
    }
    function AlistFromToJSON(value) {
        if (value === undefined) {
            return undefined;
        }
        if (value === null) {
            return null;
        }
        return {
            'kind': value.kind,
            'ext_uuid': value.ext_uuid,
            'ref_url': value.ref_url,
        };
    }
    var AlistFromKindEnum;
    (function (AlistFromKindEnum) {
        AlistFromKindEnum["quizlet"] = "quizlet";
        AlistFromKindEnum["cram"] = "cram";
        AlistFromKindEnum["brainscape"] = "brainscape";
        AlistFromKindEnum["learnalist"] = "learnalist";
    })(AlistFromKindEnum || (AlistFromKindEnum = {}));

    function AlistInfoFromJSON(json) {
        return AlistInfoFromJSONTyped(json);
    }
    function AlistInfoFromJSONTyped(json, ignoreDiscriminator) {
        if ((json === undefined) || (json === null)) {
            return json;
        }
        return {
            'title': json['title'],
            'type': json['type'],
            'labels': !exists(json, 'labels') ? undefined : json['labels'],
            'shared_with': !exists(json, 'shared_with') ? undefined : json['shared_with'],
            'interact': !exists(json, 'interact') ? undefined : AlistInteractFromJSON(json['interact']),
            'from': !exists(json, 'from') ? undefined : AlistFromFromJSON(json['from']),
        };
    }
    function AlistInfoToJSON(value) {
        if (value === undefined) {
            return undefined;
        }
        if (value === null) {
            return null;
        }
        return {
            'title': value.title,
            'type': value.type,
            'labels': value.labels,
            'shared_with': value.shared_with,
            'interact': AlistInteractToJSON(value.interact),
            'from': AlistFromToJSON(value.from),
        };
    }

    function AlistInputFromJSON(json) {
        return AlistInputFromJSONTyped(json);
    }
    function AlistInputFromJSONTyped(json, ignoreDiscriminator) {
        if ((json === undefined) || (json === null)) {
            return json;
        }
        return {
            'info': AlistInfoFromJSON(json['info']),
            'data': AnyTypeFromJSON(json['data']),
        };
    }
    function AlistInputToJSON(value) {
        if (value === undefined) {
            return undefined;
        }
        if (value === null) {
            return null;
        }
        return {
            'info': AlistInfoToJSON(value.info),
            'data': AnyTypeToJSON(value.data),
        };
    }

    function AlistInteractFromJSON(json) {
        return AlistInteractFromJSONTyped(json);
    }
    function AlistInteractFromJSONTyped(json, ignoreDiscriminator) {
        if ((json === undefined) || (json === null)) {
            return json;
        }
        return {
            'slideshow': !exists(json, 'slideshow') ? undefined : json['slideshow'],
            'totalrecall': !exists(json, 'totalrecall') ? undefined : json['totalrecall'],
        };
    }
    function AlistInteractToJSON(value) {
        if (value === undefined) {
            return undefined;
        }
        if (value === null) {
            return null;
        }
        return {
            'slideshow': value.slideshow,
            'totalrecall': value.totalrecall,
        };
    }

    function AnyTypeFromJSON(json) {
        return AnyTypeFromJSONTyped(json);
    }
    function AnyTypeFromJSONTyped(json, ignoreDiscriminator) {
        return json;
    }
    function AnyTypeToJSON(value) {
        return value;
    }

    var ChallengeKind;
    (function (ChallengeKind) {
        ChallengeKind["plank_group"] = "plank-group";
    })(ChallengeKind || (ChallengeKind = {}));

    var HttpAssetShareRequestBodyActionEnum;
    (function (HttpAssetShareRequestBodyActionEnum) {
        HttpAssetShareRequestBodyActionEnum["private"] = "private";
        HttpAssetShareRequestBodyActionEnum["public"] = "public";
    })(HttpAssetShareRequestBodyActionEnum || (HttpAssetShareRequestBodyActionEnum = {}));

    var HttpAssetUploadRequestBodySharedWithEnum;
    (function (HttpAssetUploadRequestBodySharedWithEnum) {
        HttpAssetUploadRequestBodySharedWithEnum["private"] = "private";
        HttpAssetUploadRequestBodySharedWithEnum["public"] = "public";
    })(HttpAssetUploadRequestBodySharedWithEnum || (HttpAssetUploadRequestBodySharedWithEnum = {}));

    var HttpMobileRegisterInputAppIdentifierEnum;
    (function (HttpMobileRegisterInputAppIdentifierEnum) {
        HttpMobileRegisterInputAppIdentifierEnum["plank_v1"] = "plank_v1";
        HttpMobileRegisterInputAppIdentifierEnum["remind_v1"] = "remind_v1";
    })(HttpMobileRegisterInputAppIdentifierEnum || (HttpMobileRegisterInputAppIdentifierEnum = {}));

    function HttpResponseMessageFromJSON(json) {
        return HttpResponseMessageFromJSONTyped(json);
    }
    function HttpResponseMessageFromJSONTyped(json, ignoreDiscriminator) {
        if ((json === undefined) || (json === null)) {
            return json;
        }
        return {
            'message': json['message'],
        };
    }

    function HttpUserInfoInputToJSON(value) {
        if (value === undefined) {
            return undefined;
        }
        if (value === null) {
            return null;
        }
        return {
            'display_name': value.display_name,
            'created_via': value.created_via,
            'grant_public_list_write_access': value.grant_public_list_write_access,
        };
    }
    var HttpUserInfoInputCreatedViaEnum;
    (function (HttpUserInfoInputCreatedViaEnum) {
        HttpUserInfoInputCreatedViaEnum["plank_app_v1"] = "plank.app.v1";
    })(HttpUserInfoInputCreatedViaEnum || (HttpUserInfoInputCreatedViaEnum = {}));

    function HttpUserLoginIDPInputToJSON(value) {
        if (value === undefined) {
            return undefined;
        }
        if (value === null) {
            return null;
        }
        return {
            'idp': value.idp,
            'id_token': value.id_token,
            'code': value.code,
        };
    }
    var HttpUserLoginIDPInputIdpEnum;
    (function (HttpUserLoginIDPInputIdpEnum) {
        HttpUserLoginIDPInputIdpEnum["google"] = "google";
    })(HttpUserLoginIDPInputIdpEnum || (HttpUserLoginIDPInputIdpEnum = {}));

    function HttpUserLoginRequestToJSON(value) {
        return value;
    }

    function HttpUserLoginResponseFromJSON(json) {
        return HttpUserLoginResponseFromJSONTyped(json);
    }
    function HttpUserLoginResponseFromJSONTyped(json, ignoreDiscriminator) {
        if ((json === undefined) || (json === null)) {
            return json;
        }
        return {
            'token': json['token'],
            'user_uuid': json['user_uuid'],
        };
    }

    function HttpUserRegisterInputToJSON(value) {
        if (value === undefined) {
            return undefined;
        }
        if (value === null) {
            return null;
        }
        return {
            'username': value.username,
            'password': value.password,
            'extra': HttpUserInfoInputToJSON(value.extra),
        };
    }

    function HttpUserRegisterResponseFromJSON(json) {
        return HttpUserRegisterResponseFromJSONTyped(json);
    }
    function HttpUserRegisterResponseFromJSONTyped(json, ignoreDiscriminator) {
        if ((json === undefined) || (json === null)) {
            return json;
        }
        return {
            'username': json['username'],
            'uuid': json['uuid'],
        };
    }

    var MobileDeviceInfoAppIdentifierEnum;
    (function (MobileDeviceInfoAppIdentifierEnum) {
        MobileDeviceInfoAppIdentifierEnum["plank_v1"] = "plank_v1";
        MobileDeviceInfoAppIdentifierEnum["remind_v1"] = "remind_v1";
    })(MobileDeviceInfoAppIdentifierEnum || (MobileDeviceInfoAppIdentifierEnum = {}));

    function PlankFromJSON(json) {
        return PlankFromJSONTyped(json);
    }
    function PlankFromJSONTyped(json, ignoreDiscriminator) {
        if ((json === undefined) || (json === null)) {
            return json;
        }
        return {
            'uuid': !exists(json, 'uuid') ? undefined : json['uuid'],
            'showIntervals': json['showIntervals'],
            'intervalTime': json['intervalTime'],
            'beginningTime': json['beginningTime'],
            'currentTime': json['currentTime'],
            'timerNow': json['timerNow'],
            'intervalTimerNow': json['intervalTimerNow'],
            'laps': json['laps'],
        };
    }
    function PlankToJSON(value) {
        if (value === undefined) {
            return undefined;
        }
        if (value === null) {
            return null;
        }
        return {
            'uuid': value.uuid,
            'showIntervals': value.showIntervals,
            'intervalTime': value.intervalTime,
            'beginningTime': value.beginningTime,
            'currentTime': value.currentTime,
            'timerNow': value.timerNow,
            'intervalTimerNow': value.intervalTimerNow,
            'laps': value.laps,
        };
    }

    var RemindMedium;
    (function (RemindMedium) {
        RemindMedium["push"] = "push";
        RemindMedium["email"] = "email";
    })(RemindMedium || (RemindMedium = {}));

    function SpacedRepetitionEntryViewedToJSON(value) {
        if (value === undefined) {
            return undefined;
        }
        if (value === null) {
            return null;
        }
        return {
            'uuid': value.uuid,
            'action': value.action,
        };
    }

    function SpacedRepetitionOvertimeInfoFromJSON(json) {
        return SpacedRepetitionOvertimeInfoFromJSONTyped(json);
    }
    function SpacedRepetitionOvertimeInfoFromJSONTyped(json, ignoreDiscriminator) {
        if ((json === undefined) || (json === null)) {
            return json;
        }
        return {
            'dripfeed_uuid': json['dripfeed_uuid'],
            'alist_uuid': json['alist_uuid'],
            'user_uuid': json['user_uuid'],
        };
    }

    function SpacedRepetitionOvertimeInputBaseFromJSON(json) {
        return SpacedRepetitionOvertimeInputBaseFromJSONTyped(json);
    }
    function SpacedRepetitionOvertimeInputBaseFromJSONTyped(json, ignoreDiscriminator) {
        if ((json === undefined) || (json === null)) {
            return json;
        }
        return {
            'alist_uuid': json['alist_uuid'],
            'user_uuid': json['user_uuid'],
        };
    }
    function SpacedRepetitionOvertimeInputBaseToJSON(value) {
        if (value === undefined) {
            return undefined;
        }
        if (value === null) {
            return null;
        }
        return {
            'alist_uuid': value.alist_uuid,
            'user_uuid': value.user_uuid,
        };
    }

    function VersionFromJSON(json) {
        return VersionFromJSONTyped(json);
    }
    function VersionFromJSONTyped(json, ignoreDiscriminator) {
        if ((json === undefined) || (json === null)) {
            return json;
        }
        return {
            'gitHash': json['gitHash'],
            'gitDate': json['gitDate'],
            'version': json['version'],
            'url': json['url'],
        };
    }

    class AListApi extends BaseAPI {
        addListRaw(requestParameters) {
            return __awaiter(this, void 0, void 0, function* () {
                if (requestParameters.alistInput === null || requestParameters.alistInput === undefined) {
                    throw new RequiredError('alistInput', 'Required parameter requestParameters.alistInput was null or undefined when calling addList.');
                }
                const queryParameters = {};
                const headerParameters = {};
                headerParameters['Content-Type'] = 'application/json';
                if (this.configuration && (this.configuration.username !== undefined || this.configuration.password !== undefined)) {
                    headerParameters["Authorization"] = "Basic " + btoa(this.configuration.username + ":" + this.configuration.password);
                }
                if (this.configuration && this.configuration.accessToken) {
                    const token = this.configuration.accessToken;
                    const tokenString = typeof token === 'function' ? token("bearerAuth", []) : token;
                    if (tokenString) {
                        headerParameters["Authorization"] = `Bearer ${tokenString}`;
                    }
                }
                const response = yield this.request({
                    path: `/alist`,
                    method: 'POST',
                    headers: headerParameters,
                    query: queryParameters,
                    body: AlistInputToJSON(requestParameters.alistInput),
                });
                return new JSONApiResponse(response, (jsonValue) => AlistFromJSON(jsonValue));
            });
        }
        addList(requestParameters) {
            return __awaiter(this, void 0, void 0, function* () {
                const response = yield this.addListRaw(requestParameters);
                return yield response.value();
            });
        }
        deleteListByUuidRaw(requestParameters) {
            return __awaiter(this, void 0, void 0, function* () {
                if (requestParameters.uuid === null || requestParameters.uuid === undefined) {
                    throw new RequiredError('uuid', 'Required parameter requestParameters.uuid was null or undefined when calling deleteListByUuid.');
                }
                const queryParameters = {};
                const headerParameters = {};
                if (this.configuration && (this.configuration.username !== undefined || this.configuration.password !== undefined)) {
                    headerParameters["Authorization"] = "Basic " + btoa(this.configuration.username + ":" + this.configuration.password);
                }
                if (this.configuration && this.configuration.accessToken) {
                    const token = this.configuration.accessToken;
                    const tokenString = typeof token === 'function' ? token("bearerAuth", []) : token;
                    if (tokenString) {
                        headerParameters["Authorization"] = `Bearer ${tokenString}`;
                    }
                }
                const response = yield this.request({
                    path: `/alist/{uuid}`.replace(`{${"uuid"}}`, encodeURIComponent(String(requestParameters.uuid))),
                    method: 'DELETE',
                    headers: headerParameters,
                    query: queryParameters,
                });
                return new JSONApiResponse(response, (jsonValue) => HttpResponseMessageFromJSON(jsonValue));
            });
        }
        deleteListByUuid(requestParameters) {
            return __awaiter(this, void 0, void 0, function* () {
                const response = yield this.deleteListByUuidRaw(requestParameters);
                return yield response.value();
            });
        }
        getListByUuidRaw(requestParameters) {
            return __awaiter(this, void 0, void 0, function* () {
                if (requestParameters.uuid === null || requestParameters.uuid === undefined) {
                    throw new RequiredError('uuid', 'Required parameter requestParameters.uuid was null or undefined when calling getListByUuid.');
                }
                const queryParameters = {};
                const headerParameters = {};
                if (this.configuration && (this.configuration.username !== undefined || this.configuration.password !== undefined)) {
                    headerParameters["Authorization"] = "Basic " + btoa(this.configuration.username + ":" + this.configuration.password);
                }
                if (this.configuration && this.configuration.accessToken) {
                    const token = this.configuration.accessToken;
                    const tokenString = typeof token === 'function' ? token("bearerAuth", []) : token;
                    if (tokenString) {
                        headerParameters["Authorization"] = `Bearer ${tokenString}`;
                    }
                }
                const response = yield this.request({
                    path: `/alist/{uuid}`.replace(`{${"uuid"}}`, encodeURIComponent(String(requestParameters.uuid))),
                    method: 'GET',
                    headers: headerParameters,
                    query: queryParameters,
                });
                return new JSONApiResponse(response, (jsonValue) => AlistFromJSON(jsonValue));
            });
        }
        getListByUuid(requestParameters) {
            return __awaiter(this, void 0, void 0, function* () {
                const response = yield this.getListByUuidRaw(requestParameters);
                return yield response.value();
            });
        }
        getListsByMeRaw(requestParameters) {
            return __awaiter(this, void 0, void 0, function* () {
                const queryParameters = {};
                if (requestParameters.labels !== undefined) {
                    queryParameters['labels'] = requestParameters.labels;
                }
                if (requestParameters.listType !== undefined) {
                    queryParameters['list_type'] = requestParameters.listType;
                }
                const headerParameters = {};
                if (this.configuration && (this.configuration.username !== undefined || this.configuration.password !== undefined)) {
                    headerParameters["Authorization"] = "Basic " + btoa(this.configuration.username + ":" + this.configuration.password);
                }
                if (this.configuration && this.configuration.accessToken) {
                    const token = this.configuration.accessToken;
                    const tokenString = typeof token === 'function' ? token("bearerAuth", []) : token;
                    if (tokenString) {
                        headerParameters["Authorization"] = `Bearer ${tokenString}`;
                    }
                }
                const response = yield this.request({
                    path: `/alist/by/me`,
                    method: 'GET',
                    headers: headerParameters,
                    query: queryParameters,
                });
                return new JSONApiResponse(response, (jsonValue) => jsonValue.map(AlistFromJSON));
            });
        }
        getListsByMe(requestParameters) {
            return __awaiter(this, void 0, void 0, function* () {
                const response = yield this.getListsByMeRaw(requestParameters);
                return yield response.value();
            });
        }
        updateListByUuidRaw(requestParameters) {
            return __awaiter(this, void 0, void 0, function* () {
                if (requestParameters.uuid === null || requestParameters.uuid === undefined) {
                    throw new RequiredError('uuid', 'Required parameter requestParameters.uuid was null or undefined when calling updateListByUuid.');
                }
                if (requestParameters.alist === null || requestParameters.alist === undefined) {
                    throw new RequiredError('alist', 'Required parameter requestParameters.alist was null or undefined when calling updateListByUuid.');
                }
                const queryParameters = {};
                const headerParameters = {};
                headerParameters['Content-Type'] = 'application/json';
                if (this.configuration && (this.configuration.username !== undefined || this.configuration.password !== undefined)) {
                    headerParameters["Authorization"] = "Basic " + btoa(this.configuration.username + ":" + this.configuration.password);
                }
                if (this.configuration && this.configuration.accessToken) {
                    const token = this.configuration.accessToken;
                    const tokenString = typeof token === 'function' ? token("bearerAuth", []) : token;
                    if (tokenString) {
                        headerParameters["Authorization"] = `Bearer ${tokenString}`;
                    }
                }
                const response = yield this.request({
                    path: `/alist/{uuid}`.replace(`{${"uuid"}}`, encodeURIComponent(String(requestParameters.uuid))),
                    method: 'PUT',
                    headers: headerParameters,
                    query: queryParameters,
                    body: AlistToJSON(requestParameters.alist),
                });
                return new JSONApiResponse(response, (jsonValue) => AlistFromJSON(jsonValue));
            });
        }
        updateListByUuid(requestParameters) {
            return __awaiter(this, void 0, void 0, function* () {
                const response = yield this.updateListByUuidRaw(requestParameters);
                return yield response.value();
            });
        }
    }

    var AddUserAssetSharedWithEnum;
    (function (AddUserAssetSharedWithEnum) {
        AddUserAssetSharedWithEnum["private"] = "private";
        AddUserAssetSharedWithEnum["public"] = "public";
    })(AddUserAssetSharedWithEnum || (AddUserAssetSharedWithEnum = {}));

    class DefaultApi extends BaseAPI {
        getServerVersionRaw() {
            return __awaiter(this, void 0, void 0, function* () {
                const queryParameters = {};
                const headerParameters = {};
                const response = yield this.request({
                    path: `/version`,
                    method: 'GET',
                    headers: headerParameters,
                    query: queryParameters,
                });
                return new JSONApiResponse(response, (jsonValue) => VersionFromJSON(jsonValue));
            });
        }
        getServerVersion() {
            return __awaiter(this, void 0, void 0, function* () {
                const response = yield this.getServerVersionRaw();
                return yield response.value();
            });
        }
    }

    class PlankApi extends BaseAPI {
        addPlankEntryRaw(requestParameters) {
            return __awaiter(this, void 0, void 0, function* () {
                if (requestParameters.plank === null || requestParameters.plank === undefined) {
                    throw new RequiredError('plank', 'Required parameter requestParameters.plank was null or undefined when calling addPlankEntry.');
                }
                const queryParameters = {};
                const headerParameters = {};
                headerParameters['Content-Type'] = 'application/json';
                if (requestParameters.xChallenge !== undefined && requestParameters.xChallenge !== null) {
                    headerParameters['x-challenge'] = String(requestParameters.xChallenge);
                }
                if (this.configuration && (this.configuration.username !== undefined || this.configuration.password !== undefined)) {
                    headerParameters["Authorization"] = "Basic " + btoa(this.configuration.username + ":" + this.configuration.password);
                }
                if (this.configuration && this.configuration.accessToken) {
                    const token = this.configuration.accessToken;
                    const tokenString = typeof token === 'function' ? token("bearerAuth", []) : token;
                    if (tokenString) {
                        headerParameters["Authorization"] = `Bearer ${tokenString}`;
                    }
                }
                const response = yield this.request({
                    path: `/plank/`,
                    method: 'POST',
                    headers: headerParameters,
                    query: queryParameters,
                    body: PlankToJSON(requestParameters.plank),
                });
                return new JSONApiResponse(response, (jsonValue) => PlankFromJSON(jsonValue));
            });
        }
        addPlankEntry(requestParameters) {
            return __awaiter(this, void 0, void 0, function* () {
                const response = yield this.addPlankEntryRaw(requestParameters);
                return yield response.value();
            });
        }
        deletePlankEntryRaw(requestParameters) {
            return __awaiter(this, void 0, void 0, function* () {
                if (requestParameters.uuid === null || requestParameters.uuid === undefined) {
                    throw new RequiredError('uuid', 'Required parameter requestParameters.uuid was null or undefined when calling deletePlankEntry.');
                }
                const queryParameters = {};
                const headerParameters = {};
                if (this.configuration && (this.configuration.username !== undefined || this.configuration.password !== undefined)) {
                    headerParameters["Authorization"] = "Basic " + btoa(this.configuration.username + ":" + this.configuration.password);
                }
                if (this.configuration && this.configuration.accessToken) {
                    const token = this.configuration.accessToken;
                    const tokenString = typeof token === 'function' ? token("bearerAuth", []) : token;
                    if (tokenString) {
                        headerParameters["Authorization"] = `Bearer ${tokenString}`;
                    }
                }
                const response = yield this.request({
                    path: `/plank/{uuid}`.replace(`{${"uuid"}}`, encodeURIComponent(String(requestParameters.uuid))),
                    method: 'DELETE',
                    headers: headerParameters,
                    query: queryParameters,
                });
                return new VoidApiResponse(response);
            });
        }
        deletePlankEntry(requestParameters) {
            return __awaiter(this, void 0, void 0, function* () {
                yield this.deletePlankEntryRaw(requestParameters);
            });
        }
        getPlankHistoryByUserRaw() {
            return __awaiter(this, void 0, void 0, function* () {
                const queryParameters = {};
                const headerParameters = {};
                if (this.configuration && (this.configuration.username !== undefined || this.configuration.password !== undefined)) {
                    headerParameters["Authorization"] = "Basic " + btoa(this.configuration.username + ":" + this.configuration.password);
                }
                if (this.configuration && this.configuration.accessToken) {
                    const token = this.configuration.accessToken;
                    const tokenString = typeof token === 'function' ? token("bearerAuth", []) : token;
                    if (tokenString) {
                        headerParameters["Authorization"] = `Bearer ${tokenString}`;
                    }
                }
                const response = yield this.request({
                    path: `/plank/history`,
                    method: 'GET',
                    headers: headerParameters,
                    query: queryParameters,
                });
                return new JSONApiResponse(response, (jsonValue) => jsonValue.map(PlankFromJSON));
            });
        }
        getPlankHistoryByUser() {
            return __awaiter(this, void 0, void 0, function* () {
                const response = yield this.getPlankHistoryByUserRaw();
                return yield response.value();
            });
        }
    }

    class SpacedRepetitionApi extends BaseAPI {
        addSpacedRepetitionEntryRaw(requestParameters) {
            return __awaiter(this, void 0, void 0, function* () {
                if (requestParameters.body === null || requestParameters.body === undefined) {
                    throw new RequiredError('body', 'Required parameter requestParameters.body was null or undefined when calling addSpacedRepetitionEntry.');
                }
                const queryParameters = {};
                const headerParameters = {};
                headerParameters['Content-Type'] = 'application/json';
                if (this.configuration && (this.configuration.username !== undefined || this.configuration.password !== undefined)) {
                    headerParameters["Authorization"] = "Basic " + btoa(this.configuration.username + ":" + this.configuration.password);
                }
                if (this.configuration && this.configuration.accessToken) {
                    const token = this.configuration.accessToken;
                    const tokenString = typeof token === 'function' ? token("bearerAuth", []) : token;
                    if (tokenString) {
                        headerParameters["Authorization"] = `Bearer ${tokenString}`;
                    }
                }
                const response = yield this.request({
                    path: `/spaced-repetition/`,
                    method: 'POST',
                    headers: headerParameters,
                    query: queryParameters,
                    body: requestParameters.body,
                });
                return new JSONApiResponse(response);
            });
        }
        addSpacedRepetitionEntry(requestParameters) {
            return __awaiter(this, void 0, void 0, function* () {
                const response = yield this.addSpacedRepetitionEntryRaw(requestParameters);
                return yield response.value();
            });
        }
        deleteSpacedRepetitionEntryRaw(requestParameters) {
            return __awaiter(this, void 0, void 0, function* () {
                if (requestParameters.uuid === null || requestParameters.uuid === undefined) {
                    throw new RequiredError('uuid', 'Required parameter requestParameters.uuid was null or undefined when calling deleteSpacedRepetitionEntry.');
                }
                const queryParameters = {};
                const headerParameters = {};
                if (this.configuration && (this.configuration.username !== undefined || this.configuration.password !== undefined)) {
                    headerParameters["Authorization"] = "Basic " + btoa(this.configuration.username + ":" + this.configuration.password);
                }
                if (this.configuration && this.configuration.accessToken) {
                    const token = this.configuration.accessToken;
                    const tokenString = typeof token === 'function' ? token("bearerAuth", []) : token;
                    if (tokenString) {
                        headerParameters["Authorization"] = `Bearer ${tokenString}`;
                    }
                }
                const response = yield this.request({
                    path: `/spaced-repetition/{uuid}`.replace(`{${"uuid"}}`, encodeURIComponent(String(requestParameters.uuid))),
                    method: 'DELETE',
                    headers: headerParameters,
                    query: queryParameters,
                });
                return new VoidApiResponse(response);
            });
        }
        deleteSpacedRepetitionEntry(requestParameters) {
            return __awaiter(this, void 0, void 0, function* () {
                yield this.deleteSpacedRepetitionEntryRaw(requestParameters);
            });
        }
        getNextSpacedRepetitionEntryRaw() {
            return __awaiter(this, void 0, void 0, function* () {
                const queryParameters = {};
                const headerParameters = {};
                if (this.configuration && (this.configuration.username !== undefined || this.configuration.password !== undefined)) {
                    headerParameters["Authorization"] = "Basic " + btoa(this.configuration.username + ":" + this.configuration.password);
                }
                if (this.configuration && this.configuration.accessToken) {
                    const token = this.configuration.accessToken;
                    const tokenString = typeof token === 'function' ? token("bearerAuth", []) : token;
                    if (tokenString) {
                        headerParameters["Authorization"] = `Bearer ${tokenString}`;
                    }
                }
                const response = yield this.request({
                    path: `/spaced-repetition/next`,
                    method: 'GET',
                    headers: headerParameters,
                    query: queryParameters,
                });
                return new JSONApiResponse(response);
            });
        }
        getNextSpacedRepetitionEntry() {
            return __awaiter(this, void 0, void 0, function* () {
                const response = yield this.getNextSpacedRepetitionEntryRaw();
                return yield response.value();
            });
        }
        getSpacedRepetitionEntriesRaw() {
            return __awaiter(this, void 0, void 0, function* () {
                const queryParameters = {};
                const headerParameters = {};
                if (this.configuration && (this.configuration.username !== undefined || this.configuration.password !== undefined)) {
                    headerParameters["Authorization"] = "Basic " + btoa(this.configuration.username + ":" + this.configuration.password);
                }
                if (this.configuration && this.configuration.accessToken) {
                    const token = this.configuration.accessToken;
                    const tokenString = typeof token === 'function' ? token("bearerAuth", []) : token;
                    if (tokenString) {
                        headerParameters["Authorization"] = `Bearer ${tokenString}`;
                    }
                }
                const response = yield this.request({
                    path: `/spaced-repetition/all`,
                    method: 'GET',
                    headers: headerParameters,
                    query: queryParameters,
                });
                return new JSONApiResponse(response);
            });
        }
        getSpacedRepetitionEntries() {
            return __awaiter(this, void 0, void 0, function* () {
                const response = yield this.getSpacedRepetitionEntriesRaw();
                return yield response.value();
            });
        }
        spacedRepetitionAddListToOvertimeRaw(requestParameters) {
            return __awaiter(this, void 0, void 0, function* () {
                if (requestParameters.body === null || requestParameters.body === undefined) {
                    throw new RequiredError('body', 'Required parameter requestParameters.body was null or undefined when calling spacedRepetitionAddListToOvertime.');
                }
                const queryParameters = {};
                const headerParameters = {};
                headerParameters['Content-Type'] = 'application/json';
                if (this.configuration && (this.configuration.username !== undefined || this.configuration.password !== undefined)) {
                    headerParameters["Authorization"] = "Basic " + btoa(this.configuration.username + ":" + this.configuration.password);
                }
                if (this.configuration && this.configuration.accessToken) {
                    const token = this.configuration.accessToken;
                    const tokenString = typeof token === 'function' ? token("bearerAuth", []) : token;
                    if (tokenString) {
                        headerParameters["Authorization"] = `Bearer ${tokenString}`;
                    }
                }
                const response = yield this.request({
                    path: `/spaced-repetition/overtime`,
                    method: 'POST',
                    headers: headerParameters,
                    query: queryParameters,
                    body: requestParameters.body,
                });
                return new JSONApiResponse(response, (jsonValue) => SpacedRepetitionOvertimeInfoFromJSON(jsonValue));
            });
        }
        spacedRepetitionAddListToOvertime(requestParameters) {
            return __awaiter(this, void 0, void 0, function* () {
                const response = yield this.spacedRepetitionAddListToOvertimeRaw(requestParameters);
                return yield response.value();
            });
        }
        spacedRepetitionOvertimeIsActiveRaw(requestParameters) {
            return __awaiter(this, void 0, void 0, function* () {
                if (requestParameters.uuid === null || requestParameters.uuid === undefined) {
                    throw new RequiredError('uuid', 'Required parameter requestParameters.uuid was null or undefined when calling spacedRepetitionOvertimeIsActive.');
                }
                const queryParameters = {};
                const headerParameters = {};
                if (this.configuration && (this.configuration.username !== undefined || this.configuration.password !== undefined)) {
                    headerParameters["Authorization"] = "Basic " + btoa(this.configuration.username + ":" + this.configuration.password);
                }
                if (this.configuration && this.configuration.accessToken) {
                    const token = this.configuration.accessToken;
                    const tokenString = typeof token === 'function' ? token("bearerAuth", []) : token;
                    if (tokenString) {
                        headerParameters["Authorization"] = `Bearer ${tokenString}`;
                    }
                }
                const response = yield this.request({
                    path: `/spaced-repetition/overtime/active/{uuid}`.replace(`{${"uuid"}}`, encodeURIComponent(String(requestParameters.uuid))),
                    method: 'GET',
                    headers: headerParameters,
                    query: queryParameters,
                });
                return new VoidApiResponse(response);
            });
        }
        spacedRepetitionOvertimeIsActive(requestParameters) {
            return __awaiter(this, void 0, void 0, function* () {
                yield this.spacedRepetitionOvertimeIsActiveRaw(requestParameters);
            });
        }
        spacedRepetitionRemoveListFromOvertimeRaw(requestParameters) {
            return __awaiter(this, void 0, void 0, function* () {
                if (requestParameters.spacedRepetitionOvertimeInputBase === null || requestParameters.spacedRepetitionOvertimeInputBase === undefined) {
                    throw new RequiredError('spacedRepetitionOvertimeInputBase', 'Required parameter requestParameters.spacedRepetitionOvertimeInputBase was null or undefined when calling spacedRepetitionRemoveListFromOvertime.');
                }
                const queryParameters = {};
                const headerParameters = {};
                headerParameters['Content-Type'] = 'application/json';
                if (this.configuration && (this.configuration.username !== undefined || this.configuration.password !== undefined)) {
                    headerParameters["Authorization"] = "Basic " + btoa(this.configuration.username + ":" + this.configuration.password);
                }
                if (this.configuration && this.configuration.accessToken) {
                    const token = this.configuration.accessToken;
                    const tokenString = typeof token === 'function' ? token("bearerAuth", []) : token;
                    if (tokenString) {
                        headerParameters["Authorization"] = `Bearer ${tokenString}`;
                    }
                }
                const response = yield this.request({
                    path: `/spaced-repetition/overtime`,
                    method: 'DELETE',
                    headers: headerParameters,
                    query: queryParameters,
                    body: SpacedRepetitionOvertimeInputBaseToJSON(requestParameters.spacedRepetitionOvertimeInputBase),
                });
                return new JSONApiResponse(response, (jsonValue) => HttpResponseMessageFromJSON(jsonValue));
            });
        }
        spacedRepetitionRemoveListFromOvertime(requestParameters) {
            return __awaiter(this, void 0, void 0, function* () {
                const response = yield this.spacedRepetitionRemoveListFromOvertimeRaw(requestParameters);
                return yield response.value();
            });
        }
        updateSpacedRepetitionEntryRaw(requestParameters) {
            return __awaiter(this, void 0, void 0, function* () {
                if (requestParameters.spacedRepetitionEntryViewed === null || requestParameters.spacedRepetitionEntryViewed === undefined) {
                    throw new RequiredError('spacedRepetitionEntryViewed', 'Required parameter requestParameters.spacedRepetitionEntryViewed was null or undefined when calling updateSpacedRepetitionEntry.');
                }
                const queryParameters = {};
                const headerParameters = {};
                headerParameters['Content-Type'] = 'application/json';
                if (this.configuration && (this.configuration.username !== undefined || this.configuration.password !== undefined)) {
                    headerParameters["Authorization"] = "Basic " + btoa(this.configuration.username + ":" + this.configuration.password);
                }
                if (this.configuration && this.configuration.accessToken) {
                    const token = this.configuration.accessToken;
                    const tokenString = typeof token === 'function' ? token("bearerAuth", []) : token;
                    if (tokenString) {
                        headerParameters["Authorization"] = `Bearer ${tokenString}`;
                    }
                }
                const response = yield this.request({
                    path: `/spaced-repetition/viewed`,
                    method: 'POST',
                    headers: headerParameters,
                    query: queryParameters,
                    body: SpacedRepetitionEntryViewedToJSON(requestParameters.spacedRepetitionEntryViewed),
                });
                return new JSONApiResponse(response);
            });
        }
        updateSpacedRepetitionEntry(requestParameters) {
            return __awaiter(this, void 0, void 0, function* () {
                const response = yield this.updateSpacedRepetitionEntryRaw(requestParameters);
                return yield response.value();
            });
        }
    }

    class UserApi extends BaseAPI {
        deleteUserRaw(requestParameters) {
            return __awaiter(this, void 0, void 0, function* () {
                if (requestParameters.uuid === null || requestParameters.uuid === undefined) {
                    throw new RequiredError('uuid', 'Required parameter requestParameters.uuid was null or undefined when calling deleteUser.');
                }
                const queryParameters = {};
                const headerParameters = {};
                if (this.configuration && (this.configuration.username !== undefined || this.configuration.password !== undefined)) {
                    headerParameters["Authorization"] = "Basic " + btoa(this.configuration.username + ":" + this.configuration.password);
                }
                if (this.configuration && this.configuration.accessToken) {
                    const token = this.configuration.accessToken;
                    const tokenString = typeof token === 'function' ? token("bearerAuth", []) : token;
                    if (tokenString) {
                        headerParameters["Authorization"] = `Bearer ${tokenString}`;
                    }
                }
                const response = yield this.request({
                    path: `/user/{uuid}`.replace(`{${"uuid"}}`, encodeURIComponent(String(requestParameters.uuid))),
                    method: 'DELETE',
                    headers: headerParameters,
                    query: queryParameters,
                });
                return new JSONApiResponse(response, (jsonValue) => HttpResponseMessageFromJSON(jsonValue));
            });
        }
        deleteUser(requestParameters) {
            return __awaiter(this, void 0, void 0, function* () {
                const response = yield this.deleteUserRaw(requestParameters);
                return yield response.value();
            });
        }
        getUserInfoRaw(requestParameters) {
            return __awaiter(this, void 0, void 0, function* () {
                if (requestParameters.uuid === null || requestParameters.uuid === undefined) {
                    throw new RequiredError('uuid', 'Required parameter requestParameters.uuid was null or undefined when calling getUserInfo.');
                }
                const queryParameters = {};
                const headerParameters = {};
                if (this.configuration && (this.configuration.username !== undefined || this.configuration.password !== undefined)) {
                    headerParameters["Authorization"] = "Basic " + btoa(this.configuration.username + ":" + this.configuration.password);
                }
                if (this.configuration && this.configuration.accessToken) {
                    const token = this.configuration.accessToken;
                    const tokenString = typeof token === 'function' ? token("bearerAuth", []) : token;
                    if (tokenString) {
                        headerParameters["Authorization"] = `Bearer ${tokenString}`;
                    }
                }
                const response = yield this.request({
                    path: `/user/info/{uuid}`.replace(`{${"uuid"}}`, encodeURIComponent(String(requestParameters.uuid))),
                    method: 'GET',
                    headers: headerParameters,
                    query: queryParameters,
                });
                return new JSONApiResponse(response);
            });
        }
        getUserInfo(requestParameters) {
            return __awaiter(this, void 0, void 0, function* () {
                const response = yield this.getUserInfoRaw(requestParameters);
                return yield response.value();
            });
        }
        loginWithIdpIdTokenRaw(requestParameters) {
            return __awaiter(this, void 0, void 0, function* () {
                if (requestParameters.httpUserLoginIDPInput === null || requestParameters.httpUserLoginIDPInput === undefined) {
                    throw new RequiredError('httpUserLoginIDPInput', 'Required parameter requestParameters.httpUserLoginIDPInput was null or undefined when calling loginWithIdpIdToken.');
                }
                const queryParameters = {};
                const headerParameters = {};
                headerParameters['Content-Type'] = 'application/json';
                const response = yield this.request({
                    path: `/user/login/idp`,
                    method: 'POST',
                    headers: headerParameters,
                    query: queryParameters,
                    body: HttpUserLoginIDPInputToJSON(requestParameters.httpUserLoginIDPInput),
                });
                return new JSONApiResponse(response, (jsonValue) => HttpUserLoginResponseFromJSON(jsonValue));
            });
        }
        loginWithIdpIdToken(requestParameters) {
            return __awaiter(this, void 0, void 0, function* () {
                const response = yield this.loginWithIdpIdTokenRaw(requestParameters);
                return yield response.value();
            });
        }
        loginWithUsernameAndPasswordRaw(requestParameters) {
            return __awaiter(this, void 0, void 0, function* () {
                if (requestParameters.httpUserLoginRequest === null || requestParameters.httpUserLoginRequest === undefined) {
                    throw new RequiredError('httpUserLoginRequest', 'Required parameter requestParameters.httpUserLoginRequest was null or undefined when calling loginWithUsernameAndPassword.');
                }
                const queryParameters = {};
                const headerParameters = {};
                headerParameters['Content-Type'] = 'application/json';
                const response = yield this.request({
                    path: `/user/login`,
                    method: 'POST',
                    headers: headerParameters,
                    query: queryParameters,
                    body: HttpUserLoginRequestToJSON(requestParameters.httpUserLoginRequest),
                });
                return new JSONApiResponse(response, (jsonValue) => HttpUserLoginResponseFromJSON(jsonValue));
            });
        }
        loginWithUsernameAndPassword(requestParameters) {
            return __awaiter(this, void 0, void 0, function* () {
                const response = yield this.loginWithUsernameAndPasswordRaw(requestParameters);
                return yield response.value();
            });
        }
        patchUserInfoRaw(requestParameters) {
            return __awaiter(this, void 0, void 0, function* () {
                if (requestParameters.uuid === null || requestParameters.uuid === undefined) {
                    throw new RequiredError('uuid', 'Required parameter requestParameters.uuid was null or undefined when calling patchUserInfo.');
                }
                if (requestParameters.httpUserInfoInput === null || requestParameters.httpUserInfoInput === undefined) {
                    throw new RequiredError('httpUserInfoInput', 'Required parameter requestParameters.httpUserInfoInput was null or undefined when calling patchUserInfo.');
                }
                const queryParameters = {};
                const headerParameters = {};
                headerParameters['Content-Type'] = 'application/json';
                if (this.configuration && (this.configuration.username !== undefined || this.configuration.password !== undefined)) {
                    headerParameters["Authorization"] = "Basic " + btoa(this.configuration.username + ":" + this.configuration.password);
                }
                if (this.configuration && this.configuration.accessToken) {
                    const token = this.configuration.accessToken;
                    const tokenString = typeof token === 'function' ? token("bearerAuth", []) : token;
                    if (tokenString) {
                        headerParameters["Authorization"] = `Bearer ${tokenString}`;
                    }
                }
                const response = yield this.request({
                    path: `/user/info/{uuid}`.replace(`{${"uuid"}}`, encodeURIComponent(String(requestParameters.uuid))),
                    method: 'PATCH',
                    headers: headerParameters,
                    query: queryParameters,
                    body: HttpUserInfoInputToJSON(requestParameters.httpUserInfoInput),
                });
                return new VoidApiResponse(response);
            });
        }
        patchUserInfo(requestParameters) {
            return __awaiter(this, void 0, void 0, function* () {
                yield this.patchUserInfoRaw(requestParameters);
            });
        }
        registerUserWithUsernameAndPasswordRaw(requestParameters) {
            return __awaiter(this, void 0, void 0, function* () {
                if (requestParameters.httpUserRegisterInput === null || requestParameters.httpUserRegisterInput === undefined) {
                    throw new RequiredError('httpUserRegisterInput', 'Required parameter requestParameters.httpUserRegisterInput was null or undefined when calling registerUserWithUsernameAndPassword.');
                }
                const queryParameters = {};
                const headerParameters = {};
                headerParameters['Content-Type'] = 'application/json';
                if (requestParameters.xUserRegister !== undefined && requestParameters.xUserRegister !== null) {
                    headerParameters['x-user-register'] = String(requestParameters.xUserRegister);
                }
                if (this.configuration && (this.configuration.username !== undefined || this.configuration.password !== undefined)) {
                    headerParameters["Authorization"] = "Basic " + btoa(this.configuration.username + ":" + this.configuration.password);
                }
                if (this.configuration && this.configuration.accessToken) {
                    const token = this.configuration.accessToken;
                    const tokenString = typeof token === 'function' ? token("bearerAuth", []) : token;
                    if (tokenString) {
                        headerParameters["Authorization"] = `Bearer ${tokenString}`;
                    }
                }
                const response = yield this.request({
                    path: `/user/register`,
                    method: 'POST',
                    headers: headerParameters,
                    query: queryParameters,
                    body: HttpUserRegisterInputToJSON(requestParameters.httpUserRegisterInput),
                });
                return new JSONApiResponse(response, (jsonValue) => HttpUserRegisterResponseFromJSON(jsonValue));
            });
        }
        registerUserWithUsernameAndPassword(requestParameters) {
            return __awaiter(this, void 0, void 0, function* () {
                const response = yield this.registerUserWithUsernameAndPasswordRaw(requestParameters);
                return yield response.value();
            });
        }
    }

    const Services = {
      Default: DefaultApi,
      User: UserApi,
      Alist: AListApi,
      SpacedRepetition: SpacedRepetitionApi,
      Plank: PlankApi
    };

    function getServer() {
      const server = getConfiguration(KeySettingsServer, null);
      if (server === null) {
        throw new Error('settings.server.missing');
      }
      return server;
    }

    // getApi service = One of the services based on Services
    function getApi(service) {
      var config = new Configuration({
        basePath: `${getServer()}/api/v1`,
        accessToken: getConfiguration(KeyUserAuthentication, undefined),
      });

      return new service(config);
    }

    async function addList(aList) {
      try {
        const api = getApi(Services.Alist);

        const input = {
          alistInput: AlistInputFromJSON(aList)
        };
        return await api.addList(input);
      } catch (error) {
        console.error(error);
        throw new Error("Failed to save list");
      }
    }


    async function addSpacedRepetitionEntry(entry) {
      const response = {
        status: 500,
        body: {}
      };

      try {
        const api = getApi(Services.SpacedRepetition);
        const input = {
          body: entry,
        };
        const res = await api.addSpacedRepetitionEntryRaw(input);
        response.status = res.raw.status;
        response.body = await res.value();
        return response;
      } catch (error) {
        response.status = error.status;
        response.body = await error.json();
        return response;
      }
    }

    async function spacedRepetitionOvertimeIsActive(uuid) {
      try {
        const api = getApi(Services.SpacedRepetition);
        await api.spacedRepetitionOvertimeIsActiveRaw({ uuid });
        return true;
      } catch (error) {
        if (error.status == 404) {
          return false;
        }
        console.log("error", error);
        throw new Error("Failed to check if list is active for adding over time to spaced repetition");
      }
    }

    async function spacedRepetitionAddListToOvertime(input) {
      try {
        const api = getApi(Services.SpacedRepetition);
        await api.spacedRepetitionAddListToOvertimeRaw({
          body: input
        });
        return true;
      } catch (error) {
        console.log("error", error);
        throw new Error("Failed to add list to spaced repetition");
      }
    }

    async function spacedRepetitionRemoveListFromOvertime(userUuid, alistUuid) {
      try {
        const api = getApi(Services.SpacedRepetition);
        const input = {
          spacedRepetitionOvertimeInputBase: SpacedRepetitionOvertimeInputBaseFromJSON({
            alist_uuid: alistUuid,
            user_uuid: userUuid,
          })
        };
        await api.spacedRepetitionRemoveListFromOvertimeRaw(input);
        return true;
      } catch (error) {
        console.log("error", error);
        throw new Error("Failed to check if list is active for adding over time to spaced repetition");
      }
    }

    // Link any component to be able to notify the banner component
    const notify = (level, message, sticky) => {
        notifications.add(level, message, sticky);
    };

    const clearNotification = () => {
        notifications.clear();
    };

    const loggedIn = () => {
        return localStorage.hasOwnProperty(KeyUserAuthentication);
    };

    const emptyData = {};

    let loaded = false;
    let aListData = copyObject(emptyData);
    const aList = writable(aListData);

    const load = async (input) => {
      aListData = input;
      aList.set(aListData);
      loaded = true;
    };

    const save = async () => {
      try {
        const input = aListData;
        input.info.type = "v2";
        input.info.from.ext_uuid = input.info.from.ext_uuid.toString();
        aListData = await addList(input);
        aList.set(aListData);

      } catch (e) {
        throw new Error(e.message);
      }

    };
    const ImportPlayStore = () => ({
      load,
      save,
      loaded: () => loaded,
      getServer: () => getServer(),
      aList
    });

    var store = ImportPlayStore();

    function convert$4(input) {
        const data = input.detail;
        return {
            info: {
                title: data.title,
                type: "v2",
                from: input.metadata,
            },
            data: data.listData,
        };
    }

    var brainscape = {
        key: "brainscape",
        convert: convert$4,
        url: "https://www.brainscape.com",
        domain: "brainscape.com",
    };

    function convert$3(input) {
        // setID = UUID
        const data = input.detail;
        const listData = data.listData.map((term) => {
            return { from: term.front_plain, to: term.back_plain };
        });

        return {
            info: {
                title: data.title,
                type: "v2",
                from: input.metadata,
            },
            data: listData,
        };
    }

    var cram = {
        key: "cram",
        convert: convert$3,
        url: "https://www.cram.com",
        domain: "cram.com",
    };

    function convert$2(input) {
        const data = input.detail;
        return {
            info: {
                title: data.title,
                type: "v2",
                from: input.metadata,
            },
            data: data.listData,
        };
    }

    var duolingo = {
        key: "duolingo",
        convert: convert$2,
        url: "https://www.duolingo.com",
        domain: "duolingo.com",
    };

    function convert$1(input) {
        const data = input.detail;
        const listData = Object.values(
            data.listData.setPageData.termIdToTermsMap
        ).map((term) => {
            return { from: term.word, to: term.definition };
        });

        return {
            info: {
                title: data.title,
                type: "v2",
                from: input.metadata,
            },
            data: listData,
        };
    }

    var quizlet = {
        key: "quizlet",
        convert: convert$1,
        url: "https://quizlet.com",
        domain: "quizlet.com",
    };

    function convert(input) {
        const aList = input.detail;
        if (aList.info.type !== "v2") {
            throw "Not v2";
        }
        aList.info.from = input.metadata;
        return aList;
    }

    var learnalist = {
        key: "learnalist",
        convert,
        url: "https://learnalist.net",
        domain: "learnalist.net",
    };

    /* src/browser-extension/import-play/start.svelte generated by Svelte v3.35.0 */

    function get_each_context$4(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[9] = list[i];
    	return child_ctx;
    }

    // (90:0) {#if show != ""}
    function create_if_block$8(ctx) {
    	let div1;
    	let div0;
    	let button;
    	let t1;
    	let t2;
    	let mounted;
    	let dispose;
    	let if_block0 = /*show*/ ctx[0] == "welcome" && create_if_block_2$5(ctx);
    	let if_block1 = /*show*/ ctx[0] == "not-supported" && create_if_block_1$6();

    	return {
    		c() {
    			div1 = element("div");
    			div0 = element("div");
    			button = element("button");
    			button.textContent = "Settings";
    			t1 = space();
    			if (if_block0) if_block0.c();
    			t2 = space();
    			if (if_block1) if_block1.c();
    			attr(button, "class", "br3");
    			attr(div0, "class", "w-100 pa3 mr2");
    			attr(div1, "class", "flex flex-column");
    		},
    		m(target, anchor) {
    			insert(target, div1, anchor);
    			append(div1, div0);
    			append(div0, button);
    			append(div1, t1);
    			if (if_block0) if_block0.m(div1, null);
    			append(div1, t2);
    			if (if_block1) if_block1.m(div1, null);

    			if (!mounted) {
    				dispose = listen(button, "click", /*click_handler*/ ctx[2]);
    				mounted = true;
    			}
    		},
    		p(ctx, dirty) {
    			if (/*show*/ ctx[0] == "welcome") {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);
    				} else {
    					if_block0 = create_if_block_2$5(ctx);
    					if_block0.c();
    					if_block0.m(div1, t2);
    				}
    			} else if (if_block0) {
    				if_block0.d(1);
    				if_block0 = null;
    			}

    			if (/*show*/ ctx[0] == "not-supported") {
    				if (if_block1) ; else {
    					if_block1 = create_if_block_1$6();
    					if_block1.c();
    					if_block1.m(div1, null);
    				}
    			} else if (if_block1) {
    				if_block1.d(1);
    				if_block1 = null;
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(div1);
    			if (if_block0) if_block0.d();
    			if (if_block1) if_block1.d();
    			mounted = false;
    			dispose();
    		}
    	};
    }

    // (95:4) {#if show == "welcome"}
    function create_if_block_2$5(ctx) {
    	let div;
    	let h1;
    	let t1;
    	let p;
    	let t3;
    	let ul;
    	let each_value = /*providers*/ ctx[1];
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$4(get_each_context$4(ctx, each_value, i));
    	}

    	return {
    		c() {
    			div = element("div");
    			h1 = element("h1");
    			h1.textContent = "Welcome!!";
    			t1 = space();
    			p = element("p");
    			p.textContent = "We will only try and load lists from";
    			t3 = space();
    			ul = element("ul");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			attr(ul, "class", "list");
    			attr(div, "class", "w-100 pa3 mr2");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			append(div, h1);
    			append(div, t1);
    			append(div, p);
    			append(div, t3);
    			append(div, ul);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(ul, null);
    			}
    		},
    		p(ctx, dirty) {
    			if (dirty & /*providers*/ 2) {
    				each_value = /*providers*/ ctx[1];
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$4(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block$4(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(ul, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			destroy_each(each_blocks, detaching);
    		}
    	};
    }

    // (100:10) {#each providers as provider}
    function create_each_block$4(ctx) {
    	let li;
    	let a;
    	let t0_value = /*provider*/ ctx[9].domain + "";
    	let t0;
    	let t1;

    	return {
    		c() {
    			li = element("li");
    			a = element("a");
    			t0 = text(t0_value);
    			t1 = space();
    			attr(a, "href", /*provider*/ ctx[9].url);
    			attr(a, "target", "_blank");
    		},
    		m(target, anchor) {
    			insert(target, li, anchor);
    			append(li, a);
    			append(a, t0);
    			append(li, t1);
    		},
    		p: noop,
    		d(detaching) {
    			if (detaching) detach(li);
    		}
    	};
    }

    // (109:4) {#if show == "not-supported"}
    function create_if_block_1$6(ctx) {
    	let div;

    	return {
    		c() {
    			div = element("div");

    			div.innerHTML = `<p>We were unable to find a list on this page.</p> 
        <p>Do you think this is a bug? Let us know</p>`;

    			attr(div, "class", "w-100 pa3 mr2");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    		}
    	};
    }

    function create_fragment$j(ctx) {
    	let if_block_anchor;
    	let if_block = /*show*/ ctx[0] != "" && create_if_block$8(ctx);

    	return {
    		c() {
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    		},
    		m(target, anchor) {
    			if (if_block) if_block.m(target, anchor);
    			insert(target, if_block_anchor, anchor);
    		},
    		p(ctx, [dirty]) {
    			if (/*show*/ ctx[0] != "") {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    				} else {
    					if_block = create_if_block$8(ctx);
    					if_block.c();
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach(if_block_anchor);
    		}
    	};
    }

    function instance$l($$self, $$props, $$invalidate) {
    	let aList;
    	let show = "";
    	let assumeFailedToFindList = null;
    	const providers = [learnalist, brainscape, cram, duolingo, quizlet];
    	const mappers = Object.fromEntries(providers.map(e => [e.key, e.convert]));
    	const domains = providers.map(e => e.domain);

    	onMount(async () => {
    		clearNotification();

    		// Development feature
    		const localDomain = getConfiguration("dev.checklist.domain", "");

    		if (localDomain != "") {
    			domains.push(localDomain);
    		}

    		listenForMessagesFromBrowser(mappers);
    		checkForLists(domains);
    	});

    	function listenForMessagesFromBrowser(mappers) {
    		chrome.runtime.onMessageExternal.addListener(function (request) {
    			try {
    				clearTimeout(assumeFailedToFindList);
    				assumeFailedToFindList = null;

    				// Mapping based on kind
    				if (mappers.hasOwnProperty(request.kind)) {
    					const mapper = mappers[request.kind];
    					aList = mapper(request);
    				}

    				// TODO do i trim v2 in the data?
    				// Trim entries
    				aList.data.map(entry => {
    					entry.from = entry.from.trim();
    					entry.to = entry.to.trim();
    					return entry;
    				});

    				aList = aList;
    				document.querySelector("#play-data").innerHTML = JSON.stringify(aList);

    				if (!aList) {
    					throw "list.not.found";
    				}

    				store.load(aList);
    				push("/overview");
    			} catch(e) {
    				$$invalidate(0, show = "not-supported");
    			}
    		});
    	}

    	function checkForLists(allowedDomains) {
    		chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    			const load = allowedDomains.some(domain => tabs[0].url.includes(domain));

    			if (!load) {
    				$$invalidate(0, show = "welcome");
    				return;
    			}

    			$$invalidate(0, show = "");

    			// Part of debugging
    			chrome.tabs.sendMessage(tabs[0].id, { kind: "load-data" });

    			assumeFailedToFindList = setTimeout(
    				() => {
    					$$invalidate(0, show = "welcome");
    				},
    				100
    			);
    		});
    	}

    	const click_handler = () => push("/settings");
    	return [show, providers, click_handler];
    }

    class Start extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$l, create_fragment$j, safe_not_equal, {});
    	}
    }

    /* src/browser-extension/import-play/info.svelte generated by Svelte v3.35.0 */

    function get_each_context$3(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[10] = list[i];
    	child_ctx[12] = i;
    	return child_ctx;
    }

    // (40:4) {#if loggedIn()}
    function create_if_block_3$2(ctx) {
    	let button;
    	let t1;
    	let if_block_anchor;
    	let mounted;
    	let dispose;
    	let if_block = /*$aList*/ ctx[2].info.from.kind != "learnalist" && create_if_block_4$2(ctx);

    	return {
    		c() {
    			button = element("button");
    			button.textContent = "🧠 + 💪";
    			t1 = space();
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    			attr(button, "class", "br3");
    		},
    		m(target, anchor) {
    			insert(target, button, anchor);
    			insert(target, t1, anchor);
    			if (if_block) if_block.m(target, anchor);
    			insert(target, if_block_anchor, anchor);

    			if (!mounted) {
    				dispose = listen(button, "click", /*click_handler_3*/ ctx[8]);
    				mounted = true;
    			}
    		},
    		p(ctx, dirty) {
    			if (/*$aList*/ ctx[2].info.from.kind != "learnalist") {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    				} else {
    					if_block = create_if_block_4$2(ctx);
    					if_block.c();
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(button);
    			if (detaching) detach(t1);
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach(if_block_anchor);
    			mounted = false;
    			dispose();
    		}
    	};
    }

    // (45:6) {#if $aList.info.from.kind != "learnalist"}
    function create_if_block_4$2(ctx) {
    	let button;
    	let mounted;
    	let dispose;

    	return {
    		c() {
    			button = element("button");
    			button.textContent = "Save to Learnalist";
    			attr(button, "class", "br3");
    		},
    		m(target, anchor) {
    			insert(target, button, anchor);

    			if (!mounted) {
    				dispose = listen(button, "click", /*handleSave*/ ctx[4]);
    				mounted = true;
    			}
    		},
    		p: noop,
    		d(detaching) {
    			if (detaching) detach(button);
    			mounted = false;
    			dispose();
    		}
    	};
    }

    // (52:4) {#if show == "overview"}
    function create_if_block_2$4(ctx) {
    	let header;
    	let h1;
    	let t0_value = /*$aList*/ ctx[2].info.title + "";
    	let t0;
    	let t1;
    	let div;
    	let table;
    	let thead;
    	let t5;
    	let tbody;
    	let each_value = /*$aList*/ ctx[2].data;
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$3(get_each_context$3(ctx, each_value, i));
    	}

    	return {
    		c() {
    			header = element("header");
    			h1 = element("h1");
    			t0 = text(t0_value);
    			t1 = space();
    			div = element("div");
    			table = element("table");
    			thead = element("thead");

    			thead.innerHTML = `<tr><th class="fw6 bb b--black-20 pb3 tl">From</th> 
              <th class="fw6 bb b--black-20 pb3 tl">To</th></tr>`;

    			t5 = space();
    			tbody = element("tbody");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			attr(h1, "class", "tc");
    			attr(header, "class", "w-100");
    			attr(tbody, "class", "lh-copy");
    			attr(table, "class", "w-100");
    			attr(table, "cellspacing", "0");
    		},
    		m(target, anchor) {
    			insert(target, header, anchor);
    			append(header, h1);
    			append(h1, t0);
    			insert(target, t1, anchor);
    			insert(target, div, anchor);
    			append(div, table);
    			append(table, thead);
    			append(table, t5);
    			append(table, tbody);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(tbody, null);
    			}
    		},
    		p(ctx, dirty) {
    			if (dirty & /*$aList*/ 4 && t0_value !== (t0_value = /*$aList*/ ctx[2].info.title + "")) set_data(t0, t0_value);

    			if (dirty & /*$aList*/ 4) {
    				each_value = /*$aList*/ ctx[2].data;
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$3(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block$3(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(tbody, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(header);
    			if (detaching) detach(t1);
    			if (detaching) detach(div);
    			destroy_each(each_blocks, detaching);
    		}
    	};
    }

    // (66:12) {#each $aList.data as item, index}
    function create_each_block$3(ctx) {
    	let tr;
    	let td0;
    	let t0_value = /*item*/ ctx[10].from + "";
    	let t0;
    	let t1;
    	let td1;
    	let t2_value = /*item*/ ctx[10].to + "";
    	let t2;
    	let t3;

    	return {
    		c() {
    			tr = element("tr");
    			td0 = element("td");
    			t0 = text(t0_value);
    			t1 = space();
    			td1 = element("td");
    			t2 = text(t2_value);
    			t3 = space();
    			attr(td0, "class", "pv3 pr3 bb b--black-20");
    			attr(td1, "class", "pv3 pr3 bb b--black-20");
    			attr(tr, "data-index", /*index*/ ctx[12]);
    		},
    		m(target, anchor) {
    			insert(target, tr, anchor);
    			append(tr, td0);
    			append(td0, t0);
    			append(tr, t1);
    			append(tr, td1);
    			append(td1, t2);
    			append(tr, t3);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*$aList*/ 4 && t0_value !== (t0_value = /*item*/ ctx[10].from + "")) set_data(t0, t0_value);
    			if (dirty & /*$aList*/ 4 && t2_value !== (t2_value = /*item*/ ctx[10].to + "")) set_data(t2, t2_value);
    		},
    		d(detaching) {
    			if (detaching) detach(tr);
    		}
    	};
    }

    // (77:4) {#if show == "saved"}
    function create_if_block$7(ctx) {
    	let if_block_anchor;

    	function select_block_type(ctx, dirty) {
    		if (!loggedIn()) return create_if_block_1$5;
    		return create_else_block;
    	}

    	let current_block_type = select_block_type();
    	let if_block = current_block_type(ctx);

    	return {
    		c() {
    			if_block.c();
    			if_block_anchor = empty();
    		},
    		m(target, anchor) {
    			if_block.m(target, anchor);
    			insert(target, if_block_anchor, anchor);
    		},
    		p(ctx, dirty) {
    			if_block.p(ctx, dirty);
    		},
    		d(detaching) {
    			if_block.d(detaching);
    			if (detaching) detach(if_block_anchor);
    		}
    	};
    }

    // (84:6) {:else}
    function create_else_block(ctx) {
    	let p0;
    	let t1;
    	let p1;
    	let a;
    	let t2;

    	return {
    		c() {
    			p0 = element("p");
    			p0.textContent = "List has been saved";
    			t1 = space();
    			p1 = element("p");
    			a = element("a");
    			t2 = text("Open in the browser");
    			attr(a, "target", "_blank");
    			attr(a, "href", /*listUrl*/ ctx[0]);
    		},
    		m(target, anchor) {
    			insert(target, p0, anchor);
    			insert(target, t1, anchor);
    			insert(target, p1, anchor);
    			append(p1, a);
    			append(a, t2);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*listUrl*/ 1) {
    				attr(a, "href", /*listUrl*/ ctx[0]);
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(p0);
    			if (detaching) detach(t1);
    			if (detaching) detach(p1);
    		}
    	};
    }

    // (78:6) {#if !loggedIn()}
    function create_if_block_1$5(ctx) {
    	let p;
    	let a;
    	let t;

    	return {
    		c() {
    			p = element("p");
    			a = element("a");
    			t = text("Log into learnalist.net");
    			attr(a, "target", "_blank");
    			attr(a, "href", `${store.getServer()}/login.html`);
    		},
    		m(target, anchor) {
    			insert(target, p, anchor);
    			append(p, a);
    			append(a, t);
    		},
    		p: noop,
    		d(detaching) {
    			if (detaching) detach(p);
    		}
    	};
    }

    function create_fragment$i(ctx) {
    	let div2;
    	let div0;
    	let button0;
    	let t1;
    	let button1;
    	let t3;
    	let button2;
    	let t5;
    	let show_if = loggedIn();
    	let t6;
    	let div1;
    	let t7;
    	let mounted;
    	let dispose;
    	let if_block0 = show_if && create_if_block_3$2(ctx);
    	let if_block1 = /*show*/ ctx[1] == "overview" && create_if_block_2$4(ctx);
    	let if_block2 = /*show*/ ctx[1] == "saved" && create_if_block$7(ctx);

    	return {
    		c() {
    			div2 = element("div");
    			div0 = element("div");
    			button0 = element("button");
    			button0.textContent = "Total Recall";
    			t1 = space();
    			button1 = element("button");
    			button1.textContent = "Slideshow";
    			t3 = space();
    			button2 = element("button");
    			button2.textContent = "Settings";
    			t5 = space();
    			if (if_block0) if_block0.c();
    			t6 = space();
    			div1 = element("div");
    			if (if_block1) if_block1.c();
    			t7 = space();
    			if (if_block2) if_block2.c();
    			attr(button0, "class", "br3");
    			attr(button1, "class", "br3");
    			attr(button2, "class", "br3");
    			attr(div0, "class", " w-100 pa3 mr2");
    			attr(div1, "class", "w-100 pa3 mr2");
    			attr(div2, "class", "flex flex-column");
    		},
    		m(target, anchor) {
    			insert(target, div2, anchor);
    			append(div2, div0);
    			append(div0, button0);
    			append(div0, t1);
    			append(div0, button1);
    			append(div0, t3);
    			append(div0, button2);
    			append(div0, t5);
    			if (if_block0) if_block0.m(div0, null);
    			append(div2, t6);
    			append(div2, div1);
    			if (if_block1) if_block1.m(div1, null);
    			append(div1, t7);
    			if (if_block2) if_block2.m(div1, null);

    			if (!mounted) {
    				dispose = [
    					listen(button0, "click", /*click_handler*/ ctx[5]),
    					listen(button1, "click", /*click_handler_1*/ ctx[6]),
    					listen(button2, "click", /*click_handler_2*/ ctx[7])
    				];

    				mounted = true;
    			}
    		},
    		p(ctx, [dirty]) {
    			if (show_if) if_block0.p(ctx, dirty);

    			if (/*show*/ ctx[1] == "overview") {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);
    				} else {
    					if_block1 = create_if_block_2$4(ctx);
    					if_block1.c();
    					if_block1.m(div1, t7);
    				}
    			} else if (if_block1) {
    				if_block1.d(1);
    				if_block1 = null;
    			}

    			if (/*show*/ ctx[1] == "saved") {
    				if (if_block2) {
    					if_block2.p(ctx, dirty);
    				} else {
    					if_block2 = create_if_block$7(ctx);
    					if_block2.c();
    					if_block2.m(div1, null);
    				}
    			} else if (if_block2) {
    				if_block2.d(1);
    				if_block2 = null;
    			}
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(div2);
    			if (if_block0) if_block0.d();
    			if (if_block1) if_block1.d();
    			if (if_block2) if_block2.d();
    			mounted = false;
    			run_all(dispose);
    		}
    	};
    }

    function instance$k($$self, $$props, $$invalidate) {
    	let $aList;
    	let aList = store.aList;
    	component_subscribe($$self, aList, value => $$invalidate(2, $aList = value));
    	let listUrl;
    	let show = "overview";
    	let saved = false;

    	async function handleSave(event) {
    		if (saved) {
    			return;
    		}

    		try {
    			await store.save();
    			$$invalidate(0, listUrl = `${store.getServer()}/alist/${$aList.uuid}.html`);
    			$$invalidate(1, show = "saved");
    			saved = true;
    		} catch(e) {
    			saved = false;
    			$$invalidate(1, show = "overview");
    			notify("error", "Unable to save to learnalist");
    		}
    	}

    	const click_handler = () => push("/play/total_recall");
    	const click_handler_1 = () => push("/play/slideshow");
    	const click_handler_2 = () => push("/settings");
    	const click_handler_3 = () => push("/spaced_repetition/add");

    	return [
    		listUrl,
    		show,
    		$aList,
    		aList,
    		handleSave,
    		click_handler,
    		click_handler_1,
    		click_handler_2,
    		click_handler_3
    	];
    }

    class Info extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$k, create_fragment$i, safe_not_equal, {});
    	}
    }

    /* src/browser-extension/import-play/settings.svelte generated by Svelte v3.35.0 */

    function create_fragment$h(ctx) {
    	let div4;
    	let div0;
    	let h1;
    	let t1;
    	let button0;
    	let t3;
    	let div1;
    	let h20;
    	let t5;
    	let p0;
    	let t7;
    	let p1;
    	let input0;
    	let t8;
    	let button1;
    	let t10;
    	let div2;
    	let h21;
    	let t12;
    	let p2;
    	let button2;
    	let t14;
    	let div3;
    	let h22;
    	let t16;
    	let p3;
    	let t18;
    	let p4;
    	let input1;
    	let t19;
    	let button3;
    	let mounted;
    	let dispose;

    	return {
    		c() {
    			div4 = element("div");
    			div0 = element("div");
    			h1 = element("h1");
    			h1.textContent = "Settings";
    			t1 = space();
    			button0 = element("button");
    			button0.textContent = "Close";
    			t3 = space();
    			div1 = element("div");
    			h20 = element("h2");
    			h20.textContent = "Change server";
    			t5 = space();
    			p0 = element("p");
    			p0.textContent = "You only need to change this if you are running your own learnalist server\n      or developing the chrome extension";
    			t7 = space();
    			p1 = element("p");
    			input0 = element("input");
    			t8 = space();
    			button1 = element("button");
    			button1.textContent = "Submit";
    			t10 = space();
    			div2 = element("div");
    			h21 = element("h2");
    			h21.textContent = "Reset to default settings";
    			t12 = space();
    			p2 = element("p");
    			button2 = element("button");
    			button2.textContent = "Reset";
    			t14 = space();
    			div3 = element("div");
    			h22 = element("h2");
    			h22.textContent = "Include domain in check list filter";
    			t16 = space();
    			p3 = element("p");
    			p3.textContent = "Used locally for debugging";
    			t18 = space();
    			p4 = element("p");
    			input1 = element("input");
    			t19 = space();
    			button3 = element("button");
    			button3.textContent = "Update";
    			attr(h1, "class", "f2 measure");
    			attr(button0, "class", "br3");
    			attr(div0, "class", " w-100 pa3 mr2");
    			attr(input0, "class", "w-100 pa3 mr2");
    			attr(button1, "class", "br3");
    			attr(div1, "class", "w-100 pa3 mr2");
    			attr(button2, "class", "br3");
    			attr(div2, "class", " w-100 pa3 mr2");
    			attr(input1, "class", "w-100 pa3 mr2");
    			attr(button3, "class", "br3");
    			attr(div3, "class", " w-100 pa3 mr2");
    			attr(div4, "class", "flex flex-column");
    		},
    		m(target, anchor) {
    			insert(target, div4, anchor);
    			append(div4, div0);
    			append(div0, h1);
    			append(div0, t1);
    			append(div0, button0);
    			append(div4, t3);
    			append(div4, div1);
    			append(div1, h20);
    			append(div1, t5);
    			append(div1, p0);
    			append(div1, t7);
    			append(div1, p1);
    			append(p1, input0);
    			set_input_value(input0, /*baseUrl*/ ctx[0]);
    			append(div1, t8);
    			append(div1, button1);
    			append(div4, t10);
    			append(div4, div2);
    			append(div2, h21);
    			append(div2, t12);
    			append(div2, p2);
    			append(p2, button2);
    			append(div4, t14);
    			append(div4, div3);
    			append(div3, h22);
    			append(div3, t16);
    			append(div3, p3);
    			append(div3, t18);
    			append(div3, p4);
    			append(p4, input1);
    			set_input_value(input1, /*debugCheckDomain*/ ctx[1]);
    			append(div3, t19);
    			append(div3, button3);

    			if (!mounted) {
    				dispose = [
    					listen(button0, "click", /*click_handler*/ ctx[5]),
    					listen(input0, "input", /*input0_input_handler*/ ctx[6]),
    					listen(button1, "click", prevent_default(/*handleSubmit*/ ctx[3])),
    					listen(button2, "click", prevent_default(/*handleReset*/ ctx[4])),
    					listen(input1, "input", /*input1_input_handler*/ ctx[7]),
    					listen(button3, "click", prevent_default(/*handleUpdateDevelopmentCheckDomain*/ ctx[2]))
    				];

    				mounted = true;
    			}
    		},
    		p(ctx, [dirty]) {
    			if (dirty & /*baseUrl*/ 1 && input0.value !== /*baseUrl*/ ctx[0]) {
    				set_input_value(input0, /*baseUrl*/ ctx[0]);
    			}

    			if (dirty & /*debugCheckDomain*/ 2 && input1.value !== /*debugCheckDomain*/ ctx[1]) {
    				set_input_value(input1, /*debugCheckDomain*/ ctx[1]);
    			}
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(div4);
    			mounted = false;
    			run_all(dispose);
    		}
    	};
    }

    function instance$j($$self, $$props, $$invalidate) {
    	let baseUrl = getConfiguration(KeySettingsServer, "https://learnalist.net");
    	let debugCheckDomain = "";

    	function handleUpdateDevelopmentCheckDomain() {
    		saveConfiguration("dev.checklist.domain", debugCheckDomain);
    	}

    	function handleSubmit() {
    		clearConfiguration();
    		saveConfiguration(KeySettingsServer, baseUrl);
    		chrome.runtime.sendMessage({ kind: "lookup-login-info" });
    	}

    	function handleReset() {
    		clearConfiguration();
    		$$invalidate(0, baseUrl = getConfiguration(KeySettingsServer, "https://learnalist.net"));
    		chrome.runtime.sendMessage({ kind: "lookup-login-info" });
    	}

    	const click_handler = () => push("/start");

    	function input0_input_handler() {
    		baseUrl = this.value;
    		$$invalidate(0, baseUrl);
    	}

    	function input1_input_handler() {
    		debugCheckDomain = this.value;
    		$$invalidate(1, debugCheckDomain);
    	}

    	return [
    		baseUrl,
    		debugCheckDomain,
    		handleUpdateDevelopmentCheckDomain,
    		handleSubmit,
    		handleReset,
    		click_handler,
    		input0_input_handler,
    		input1_input_handler
    	];
    }

    class Settings extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$j, create_fragment$h, safe_not_equal, {});
    	}
    }

    /* src/browser-extension/import-play/redirect.svelte generated by Svelte v3.35.0 */

    function instance$i($$self) {
    	if (store.loaded()) {
    		push("/overview");
    	} else {
    		push("/start");
    	}

    	return [];
    }

    class Redirect extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$i, null, safe_not_equal, {});
    	}
    }

    /* src/browser-extension/import-play/app.svelte generated by Svelte v3.35.0 */

    function create_fragment$g(ctx) {
    	let router;
    	let current;
    	router = new Router({ props: { routes: /*routes*/ ctx[0] } });
    	router.$on("conditionsFailed", /*conditionsFailed_handler*/ ctx[1]);

    	return {
    		c() {
    			create_component(router.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(router, target, anchor);
    			current = true;
    		},
    		p: noop,
    		i(local) {
    			if (current) return;
    			transition_in(router.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(router.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(router, detaching);
    		}
    	};
    }

    function instance$h($$self) {
    	const routes = {
    		"/overview": Info,
    		"/start": Start,
    		"/settings": Settings,
    		"/": Redirect
    	};

    	const conditionsFailed_handler = event => replace("/");
    	return [routes, conditionsFailed_handler];
    }

    class App extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$h, create_fragment$g, safe_not_equal, {});
    	}
    }

    /* src/components/interact/routes/nothing.svelte generated by Svelte v3.35.0 */

    function instance$g($$self, $$props, $$invalidate) {
    	let { params } = $$props;
    	document.querySelector("#list-info").style.display = "";
    	document.querySelector("#play").style.display = "none";

    	$$self.$$set = $$props => {
    		if ("params" in $$props) $$invalidate(0, params = $$props.params);
    	};

    	return [params];
    }

    class Nothing extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$g, null, safe_not_equal, { params: 0 });
    	}
    }

    /* src/components/interact/total_recall/recall.svelte generated by Svelte v3.35.0 */

    function get_each_context$2(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[19] = list[i];
    	child_ctx[21] = i;
    	return child_ctx;
    }

    function get_each_context_1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[19] = list[i];
    	child_ctx[22] = list;
    	child_ctx[21] = i;
    	return child_ctx;
    }

    function get_each_context_2(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[19] = list[i];
    	child_ctx[23] = list;
    	child_ctx[21] = i;
    	return child_ctx;
    }

    // (514:0) {#if state === 'playing'}
    function create_if_block_4$1(ctx) {
    	let p;
    	let t0;
    	let t1;
    	let t2;
    	let div;
    	let button0;
    	let t4;
    	let button1;
    	let t6;
    	let button2;
    	let mounted;
    	let dispose;
    	let if_block = /*hasChecked*/ ctx[3] && create_if_block_5$1(ctx);
    	let each_value_2 = /*playData*/ ctx[1];
    	let each_blocks = [];

    	for (let i = 0; i < each_value_2.length; i += 1) {
    		each_blocks[i] = create_each_block_2(get_each_context_2(ctx, each_value_2, i));
    	}

    	return {
    		c() {
    			p = element("p");
    			t0 = text("How many do you remember?\n    ");
    			if (if_block) if_block.c();
    			t1 = space();

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			t2 = space();
    			div = element("div");
    			button0 = element("button");
    			button0.textContent = "check";
    			t4 = space();
    			button1 = element("button");
    			button1.textContent = "I give up, show me";
    			t6 = space();
    			button2 = element("button");
    			button2.textContent = "restart";
    			attr(p, "class", "svelte-td7zkh");
    			attr(button0, "class", "br3 svelte-td7zkh");
    			attr(button1, "class", "br3 svelte-td7zkh");
    			attr(button2, "class", "br3 svelte-td7zkh");
    			attr(div, "class", "pv1 svelte-td7zkh");
    		},
    		m(target, anchor) {
    			insert(target, p, anchor);
    			append(p, t0);
    			if (if_block) if_block.m(p, null);
    			insert(target, t1, anchor);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(target, anchor);
    			}

    			insert(target, t2, anchor);
    			insert(target, div, anchor);
    			append(div, button0);
    			append(div, t4);
    			append(div, button1);
    			append(div, t6);
    			append(div, button2);

    			if (!mounted) {
    				dispose = [
    					listen(button0, "click", /*check*/ ctx[8]),
    					listen(button1, "click", /*showMe*/ ctx[11]),
    					listen(button2, "click", /*restart*/ ctx[10])
    				];

    				mounted = true;
    			}
    		},
    		p(ctx, dirty) {
    			if (/*hasChecked*/ ctx[3]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    				} else {
    					if_block = create_if_block_5$1(ctx);
    					if_block.c();
    					if_block.m(p, null);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}

    			if (dirty & /*feedback, guesses, playData*/ 70) {
    				each_value_2 = /*playData*/ ctx[1];
    				let i;

    				for (i = 0; i < each_value_2.length; i += 1) {
    					const child_ctx = get_each_context_2(ctx, each_value_2, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block_2(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(t2.parentNode, t2);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value_2.length;
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(p);
    			if (if_block) if_block.d();
    			if (detaching) detach(t1);
    			destroy_each(each_blocks, detaching);
    			if (detaching) detach(t2);
    			if (detaching) detach(div);
    			mounted = false;
    			run_all(dispose);
    		}
    	};
    }

    // (517:4) {#if hasChecked}
    function create_if_block_5$1(ctx) {
    	let t0;
    	let t1;

    	return {
    		c() {
    			t0 = text(/*leftToFind*/ ctx[4]);
    			t1 = text(" left");
    		},
    		m(target, anchor) {
    			insert(target, t0, anchor);
    			insert(target, t1, anchor);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*leftToFind*/ 16) set_data(t0, /*leftToFind*/ ctx[4]);
    		},
    		d(detaching) {
    			if (detaching) detach(t0);
    			if (detaching) detach(t1);
    		}
    	};
    }

    // (520:2) {#each playData as item, index}
    function create_each_block_2(ctx) {
    	let div;
    	let input;
    	let input_class_value;
    	let input_disabled_value;
    	let mounted;
    	let dispose;

    	function input_input_handler() {
    		/*input_input_handler*/ ctx[13].call(input, /*index*/ ctx[21]);
    	}

    	return {
    		c() {
    			div = element("div");
    			input = element("input");
    			attr(input, "class", input_class_value = "w-100 " + /*feedback*/ ctx[6][/*index*/ ctx[21]] + " svelte-td7zkh");
    			input.disabled = input_disabled_value = /*feedback*/ ctx[6][/*index*/ ctx[21]] === "found";
    			attr(input, "type", "text");
    			attr(input, "placeholder", "");
    			attr(div, "class", "pv1 svelte-td7zkh");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			append(div, input);
    			set_input_value(input, /*guesses*/ ctx[2][/*index*/ ctx[21]]);

    			if (!mounted) {
    				dispose = listen(input, "input", input_input_handler);
    				mounted = true;
    			}
    		},
    		p(new_ctx, dirty) {
    			ctx = new_ctx;

    			if (dirty & /*feedback*/ 64 && input_class_value !== (input_class_value = "w-100 " + /*feedback*/ ctx[6][/*index*/ ctx[21]] + " svelte-td7zkh")) {
    				attr(input, "class", input_class_value);
    			}

    			if (dirty & /*feedback*/ 64 && input_disabled_value !== (input_disabled_value = /*feedback*/ ctx[6][/*index*/ ctx[21]] === "found")) {
    				input.disabled = input_disabled_value;
    			}

    			if (dirty & /*guesses*/ 4 && input.value !== /*guesses*/ ctx[2][/*index*/ ctx[21]]) {
    				set_input_value(input, /*guesses*/ ctx[2][/*index*/ ctx[21]]);
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			mounted = false;
    			dispose();
    		}
    	};
    }

    // (537:0) {#if state === 'finished'}
    function create_if_block_2$3(ctx) {
    	let p0;
    	let t1;
    	let t2;
    	let t3;
    	let p1;
    	let t4;
    	let t5;
    	let t6;
    	let t7;
    	let div;
    	let button0;
    	let t9;
    	let button1;
    	let mounted;
    	let dispose;
    	let each_value_1 = /*playData*/ ctx[1];
    	let each_blocks = [];

    	for (let i = 0; i < each_value_1.length; i += 1) {
    		each_blocks[i] = create_each_block_1(get_each_context_1(ctx, each_value_1, i));
    	}

    	let if_block = /*perfect*/ ctx[5] && create_if_block_3$1();

    	return {
    		c() {
    			p0 = element("p");
    			p0.textContent = "Well done! You did it.";
    			t1 = space();

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			t2 = space();
    			if (if_block) if_block.c();
    			t3 = space();
    			p1 = element("p");
    			t4 = text("You took ");
    			t5 = text(/*attempts*/ ctx[7]);
    			t6 = text(" attempt(s)");
    			t7 = space();
    			div = element("div");
    			button0 = element("button");
    			button0.textContent = "play again";
    			t9 = space();
    			button1 = element("button");
    			button1.textContent = "restart";
    			attr(p0, "class", "svelte-td7zkh");
    			attr(p1, "class", "svelte-td7zkh");
    			attr(button0, "class", "br3 svelte-td7zkh");
    			attr(button1, "class", "br3 svelte-td7zkh");
    			attr(div, "class", "pv1 svelte-td7zkh");
    		},
    		m(target, anchor) {
    			insert(target, p0, anchor);
    			insert(target, t1, anchor);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(target, anchor);
    			}

    			insert(target, t2, anchor);
    			if (if_block) if_block.m(target, anchor);
    			insert(target, t3, anchor);
    			insert(target, p1, anchor);
    			append(p1, t4);
    			append(p1, t5);
    			append(p1, t6);
    			insert(target, t7, anchor);
    			insert(target, div, anchor);
    			append(div, button0);
    			append(div, t9);
    			append(div, button1);

    			if (!mounted) {
    				dispose = [
    					listen(button0, "click", /*playAgain*/ ctx[9]),
    					listen(button1, "click", /*restart*/ ctx[10])
    				];

    				mounted = true;
    			}
    		},
    		p(ctx, dirty) {
    			if (dirty & /*feedback, guesses, playData*/ 70) {
    				each_value_1 = /*playData*/ ctx[1];
    				let i;

    				for (i = 0; i < each_value_1.length; i += 1) {
    					const child_ctx = get_each_context_1(ctx, each_value_1, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block_1(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(t2.parentNode, t2);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value_1.length;
    			}

    			if (/*perfect*/ ctx[5]) {
    				if (if_block) ; else {
    					if_block = create_if_block_3$1();
    					if_block.c();
    					if_block.m(t3.parentNode, t3);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}

    			if (dirty & /*attempts*/ 128) set_data(t5, /*attempts*/ ctx[7]);
    		},
    		d(detaching) {
    			if (detaching) detach(p0);
    			if (detaching) detach(t1);
    			destroy_each(each_blocks, detaching);
    			if (detaching) detach(t2);
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach(t3);
    			if (detaching) detach(p1);
    			if (detaching) detach(t7);
    			if (detaching) detach(div);
    			mounted = false;
    			run_all(dispose);
    		}
    	};
    }

    // (540:2) {#each playData as item, index}
    function create_each_block_1(ctx) {
    	let div;
    	let input;
    	let input_class_value;
    	let input_disabled_value;
    	let mounted;
    	let dispose;

    	function input_input_handler_1() {
    		/*input_input_handler_1*/ ctx[14].call(input, /*index*/ ctx[21]);
    	}

    	return {
    		c() {
    			div = element("div");
    			input = element("input");
    			attr(input, "class", input_class_value = "w-100 " + /*feedback*/ ctx[6][/*index*/ ctx[21]] + " svelte-td7zkh");
    			input.disabled = input_disabled_value = /*feedback*/ ctx[6][/*index*/ ctx[21]] === "found";
    			attr(input, "type", "text");
    			attr(input, "placeholder", "");
    			attr(div, "class", "pv1 svelte-td7zkh");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			append(div, input);
    			set_input_value(input, /*guesses*/ ctx[2][/*index*/ ctx[21]]);

    			if (!mounted) {
    				dispose = listen(input, "input", input_input_handler_1);
    				mounted = true;
    			}
    		},
    		p(new_ctx, dirty) {
    			ctx = new_ctx;

    			if (dirty & /*feedback*/ 64 && input_class_value !== (input_class_value = "w-100 " + /*feedback*/ ctx[6][/*index*/ ctx[21]] + " svelte-td7zkh")) {
    				attr(input, "class", input_class_value);
    			}

    			if (dirty & /*feedback*/ 64 && input_disabled_value !== (input_disabled_value = /*feedback*/ ctx[6][/*index*/ ctx[21]] === "found")) {
    				input.disabled = input_disabled_value;
    			}

    			if (dirty & /*guesses*/ 4 && input.value !== /*guesses*/ ctx[2][/*index*/ ctx[21]]) {
    				set_input_value(input, /*guesses*/ ctx[2][/*index*/ ctx[21]]);
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			mounted = false;
    			dispose();
    		}
    	};
    }

    // (551:2) {#if perfect}
    function create_if_block_3$1(ctx) {
    	let p;

    	return {
    		c() {
    			p = element("p");
    			p.textContent = "Perfect recall!";
    			attr(p, "class", "svelte-td7zkh");
    		},
    		m(target, anchor) {
    			insert(target, p, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(p);
    		}
    	};
    }

    // (562:0) {#if state === 'show-me'}
    function create_if_block$6(ctx) {
    	let p;
    	let t0;
    	let t1;
    	let t2;
    	let div;
    	let button0;
    	let t4;
    	let button1;
    	let mounted;
    	let dispose;
    	let if_block = /*hasChecked*/ ctx[3] && create_if_block_1$4(ctx);
    	let each_value = /*playData*/ ctx[1];
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$2(get_each_context$2(ctx, each_value, i));
    	}

    	return {
    		c() {
    			p = element("p");
    			t0 = text("How many do you remember?\n    ");
    			if (if_block) if_block.c();
    			t1 = space();

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			t2 = space();
    			div = element("div");
    			button0 = element("button");
    			button0.textContent = "play again";
    			t4 = space();
    			button1 = element("button");
    			button1.textContent = "restart";
    			attr(p, "class", "svelte-td7zkh");
    			attr(button0, "class", "br3 svelte-td7zkh");
    			attr(button1, "class", "br3 svelte-td7zkh");
    			attr(div, "class", "pv2 svelte-td7zkh");
    		},
    		m(target, anchor) {
    			insert(target, p, anchor);
    			append(p, t0);
    			if (if_block) if_block.m(p, null);
    			insert(target, t1, anchor);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(target, anchor);
    			}

    			insert(target, t2, anchor);
    			insert(target, div, anchor);
    			append(div, button0);
    			append(div, t4);
    			append(div, button1);

    			if (!mounted) {
    				dispose = [
    					listen(button0, "click", /*playAgain*/ ctx[9]),
    					listen(button1, "click", /*restart*/ ctx[10])
    				];

    				mounted = true;
    			}
    		},
    		p(ctx, dirty) {
    			if (/*hasChecked*/ ctx[3]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    				} else {
    					if_block = create_if_block_1$4(ctx);
    					if_block.c();
    					if_block.m(p, null);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}

    			if (dirty & /*playData*/ 2) {
    				each_value = /*playData*/ ctx[1];
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$2(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block$2(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(t2.parentNode, t2);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(p);
    			if (if_block) if_block.d();
    			if (detaching) detach(t1);
    			destroy_each(each_blocks, detaching);
    			if (detaching) detach(t2);
    			if (detaching) detach(div);
    			mounted = false;
    			run_all(dispose);
    		}
    	};
    }

    // (565:4) {#if hasChecked}
    function create_if_block_1$4(ctx) {
    	let t0;
    	let t1;

    	return {
    		c() {
    			t0 = text(/*leftToFind*/ ctx[4]);
    			t1 = text(" left");
    		},
    		m(target, anchor) {
    			insert(target, t0, anchor);
    			insert(target, t1, anchor);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*leftToFind*/ 16) set_data(t0, /*leftToFind*/ ctx[4]);
    		},
    		d(detaching) {
    			if (detaching) detach(t0);
    			if (detaching) detach(t1);
    		}
    	};
    }

    // (568:2) {#each playData as item, index}
    function create_each_block$2(ctx) {
    	let div;
    	let input;
    	let input_value_value;

    	return {
    		c() {
    			div = element("div");
    			input = element("input");
    			attr(input, "class", "w-100 found svelte-td7zkh");
    			input.disabled = "true";
    			attr(input, "type", "text");
    			attr(input, "placeholder", "");
    			input.value = input_value_value = /*item*/ ctx[19];
    			attr(div, "class", "pv1 svelte-td7zkh");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			append(div, input);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*playData*/ 2 && input_value_value !== (input_value_value = /*item*/ ctx[19]) && input.value !== input_value_value) {
    				input.value = input_value_value;
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    		}
    	};
    }

    function create_fragment$f(ctx) {
    	let t0;
    	let t1;
    	let if_block2_anchor;
    	let if_block0 = /*state*/ ctx[0] === "playing" && create_if_block_4$1(ctx);
    	let if_block1 = /*state*/ ctx[0] === "finished" && create_if_block_2$3(ctx);
    	let if_block2 = /*state*/ ctx[0] === "show-me" && create_if_block$6(ctx);

    	return {
    		c() {
    			if (if_block0) if_block0.c();
    			t0 = space();
    			if (if_block1) if_block1.c();
    			t1 = space();
    			if (if_block2) if_block2.c();
    			if_block2_anchor = empty();
    		},
    		m(target, anchor) {
    			if (if_block0) if_block0.m(target, anchor);
    			insert(target, t0, anchor);
    			if (if_block1) if_block1.m(target, anchor);
    			insert(target, t1, anchor);
    			if (if_block2) if_block2.m(target, anchor);
    			insert(target, if_block2_anchor, anchor);
    		},
    		p(ctx, [dirty]) {
    			if (/*state*/ ctx[0] === "playing") {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);
    				} else {
    					if_block0 = create_if_block_4$1(ctx);
    					if_block0.c();
    					if_block0.m(t0.parentNode, t0);
    				}
    			} else if (if_block0) {
    				if_block0.d(1);
    				if_block0 = null;
    			}

    			if (/*state*/ ctx[0] === "finished") {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);
    				} else {
    					if_block1 = create_if_block_2$3(ctx);
    					if_block1.c();
    					if_block1.m(t1.parentNode, t1);
    				}
    			} else if (if_block1) {
    				if_block1.d(1);
    				if_block1 = null;
    			}

    			if (/*state*/ ctx[0] === "show-me") {
    				if (if_block2) {
    					if_block2.p(ctx, dirty);
    				} else {
    					if_block2 = create_if_block$6(ctx);
    					if_block2.c();
    					if_block2.m(if_block2_anchor.parentNode, if_block2_anchor);
    				}
    			} else if (if_block2) {
    				if_block2.d(1);
    				if_block2 = null;
    			}
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (if_block0) if_block0.d(detaching);
    			if (detaching) detach(t0);
    			if (if_block1) if_block1.d(detaching);
    			if (detaching) detach(t1);
    			if (if_block2) if_block2.d(detaching);
    			if (detaching) detach(if_block2_anchor);
    		}
    	};
    }

    function clean(input) {
    	// TODO have the UI allow for more options
    	return input.toLowerCase();
    }

    function instance$f($$self, $$props, $$invalidate) {
    	const dispatch = createEventDispatcher();
    	let { data = [] } = $$props;
    	let state = "playing";

    	let playData = [];
    	let guesses = [];
    	let hasChecked = false;

    	playData = data.map(item => {
    		return clean(item);
    	});

    	let leftToFind = playData.length;
    	let perfect = false;
    	let feedback = Array(playData.length).fill("");
    	let results = [];
    	let attempts = 0;

    	function check() {
    		$$invalidate(7, attempts = attempts + 1);
    		$$invalidate(3, hasChecked = true);
    		console.log(guesses);

    		results = guesses.map(input => {
    			return clean(input);
    		});

    		// Get the unique results
    		let uniques = Array.from(new Set(results));

    		uniques = uniques.filter(item => playData.includes(item));

    		let lookUp = uniques.map(item => {
    			return { data: item, position: -1 };
    		});

    		results.forEach((input, position) => {
    			lookUp = lookUp.map(item => {
    				// skip if already found
    				if (item.position !== -1) {
    					return item;
    				}

    				if (item.data !== input) {
    					return item;
    				}

    				item.position = position;
    				return item;
    			});
    		});

    		// Set all to not found
    		$$invalidate(6, feedback = Array(playData.length).fill("notfound"));

    		lookUp = lookUp.map(item => {
    			if (item.position === -1) {
    				return item;
    			}

    			$$invalidate(6, feedback[item.position] = "found", feedback);
    			return item;
    		});

    		$$invalidate(4, leftToFind = playData.length - uniques.length);

    		if (leftToFind === 0) {
    			$$invalidate(0, state = "finished");

    			if (attempts === 1) {
    				$$invalidate(5, perfect = JSON.stringify(results) === JSON.stringify(playData));
    			}

    			console.log("actual", JSON.stringify(playData));
    			console.log("guesses", JSON.stringify(results));
    		}
    	}

    	function playAgain() {
    		dispatch("finished", { perfect, attempts, playAgain: true });
    	}

    	function restart() {
    		dispatch("finished", { perfect, attempts, playAgain: false });
    	}

    	function showMe() {
    		$$invalidate(0, state = "show-me");
    	}

    	function input_input_handler(index) {
    		guesses[index] = this.value;
    		$$invalidate(2, guesses);
    	}

    	function input_input_handler_1(index) {
    		guesses[index] = this.value;
    		$$invalidate(2, guesses);
    	}

    	$$self.$$set = $$props => {
    		if ("data" in $$props) $$invalidate(12, data = $$props.data);
    	};

    	return [
    		state,
    		playData,
    		guesses,
    		hasChecked,
    		leftToFind,
    		perfect,
    		feedback,
    		attempts,
    		check,
    		playAgain,
    		restart,
    		showMe,
    		data,
    		input_input_handler,
    		input_input_handler_1
    	];
    }

    class Recall extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$f, create_fragment$f, safe_not_equal, { data: 12 });
    	}
    }

    /* src/components/interact/total_recall/view.svelte generated by Svelte v3.35.0 */

    function create_fragment$e(ctx) {
    	let blockquote;
    	let p;
    	let t;

    	return {
    		c() {
    			blockquote = element("blockquote");
    			p = element("p");
    			t = text(/*show*/ ctx[0]);
    			attr(p, "class", "f3 lh-copy svelte-1jczml0");
    			attr(blockquote, "class", "athelas ml0 mt4 pl4 black-90 bl bw2 b--black svelte-1jczml0");
    		},
    		m(target, anchor) {
    			insert(target, blockquote, anchor);
    			append(blockquote, p);
    			append(p, t);
    		},
    		p(ctx, [dirty]) {
    			if (dirty & /*show*/ 1) set_data(t, /*show*/ ctx[0]);
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(blockquote);
    		}
    	};
    }

    function instance$e($$self, $$props, $$invalidate) {
    	let show;
    	const dispatch = createEventDispatcher();
    	let { data = [] } = $$props;
    	let { speed = 1000 } = $$props;
    	let index = 0;
    	const size = data.length - 1;

    	const cancel = () => {
    		clearInterval(timeout);
    	};

    	const timeout = setInterval(
    		() => {
    			$$invalidate(0, show = data[index]);
    			$$invalidate(3, index = index + 1);

    			if (index <= size) {
    				return;
    			}

    			cancel();
    			dispatch("finished");
    		},
    		speed
    	);

    	$$self.$$set = $$props => {
    		if ("data" in $$props) $$invalidate(1, data = $$props.data);
    		if ("speed" in $$props) $$invalidate(2, speed = $$props.speed);
    	};

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*data, index*/ 10) {
    			$$invalidate(0, show = data[index]);
    		}
    	};

    	return [show, data, speed, index];
    }

    class View extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$e, create_fragment$e, safe_not_equal, { data: 1, speed: 2 });
    	}
    }

    /* src/components/interact/total_recall/v2.svelte generated by Svelte v3.35.0 */

    function create_if_block_2$2(ctx) {
    	let h1;
    	let t1;
    	let p0;
    	let t3;
    	let p1;
    	let t5;
    	let p2;
    	let t7;
    	let p3;
    	let span0;
    	let t9;
    	let input0;
    	let t10;
    	let p4;
    	let span1;
    	let t12;
    	let input1;
    	let t13;
    	let p5;
    	let t15;
    	let p6;
    	let input2;
    	let t16;
    	let t17;
    	let p7;
    	let input3;
    	let t18;
    	let t19;
    	let pre;
    	let t20_value = JSON.stringify(/*data*/ ctx[2].slice(0, 2), "", 2) + "";
    	let t20;
    	let t21;
    	let button;
    	let mounted;
    	let dispose;

    	return {
    		c() {
    			h1 = element("h1");
    			h1.textContent = "Rules";
    			t1 = space();
    			p0 = element("p");
    			p0.textContent = "Can you remember all the words?";
    			t3 = space();
    			p1 = element("p");
    			p1.textContent = "Can you remember the order to make it perfect?";
    			t5 = space();
    			p2 = element("p");
    			p2.textContent = "How many times do you need to check?";
    			t7 = space();
    			p3 = element("p");
    			span0 = element("span");
    			span0.textContent = "How many to recall?";
    			t9 = space();
    			input0 = element("input");
    			t10 = space();
    			p4 = element("p");
    			span1 = element("span");
    			span1.textContent = "How fast? (seconds)";
    			t12 = space();
    			input1 = element("input");
    			t13 = space();
    			p5 = element("p");
    			p5.innerHTML = `<span>Which to show?</span>`;
    			t15 = space();
    			p6 = element("p");
    			input2 = element("input");
    			t16 = text("\n        from");
    			t17 = space();
    			p7 = element("p");
    			input3 = element("input");
    			t18 = text("\n        to");
    			t19 = space();
    			pre = element("pre");
    			t20 = text(t20_value);
    			t21 = space();
    			button = element("button");
    			button.textContent = "Are you ready to play?";
    			attr(h1, "class", "svelte-1jczml0");
    			attr(p0, "class", "svelte-1jczml0");
    			attr(p1, "class", "svelte-1jczml0");
    			attr(p2, "class", "svelte-1jczml0");
    			attr(input0, "type", "number");
    			attr(input0, "max", /*maxSize*/ ctx[6]);
    			attr(input0, "min", "1");
    			attr(input0, "class", "svelte-1jczml0");
    			attr(p3, "class", "svelte-1jczml0");
    			attr(input1, "type", "number");
    			attr(input1, "max", 5);
    			attr(input1, "min", "1");
    			attr(input1, "class", "svelte-1jczml0");
    			attr(p4, "class", "svelte-1jczml0");
    			attr(p5, "class", "svelte-1jczml0");
    			attr(input2, "type", "radio");
    			input2.__value = "from";
    			input2.value = input2.__value;
    			attr(input2, "class", "svelte-1jczml0");
    			/*$$binding_groups*/ ctx[16][0].push(input2);
    			attr(p6, "class", "svelte-1jczml0");
    			attr(input3, "type", "radio");
    			input3.__value = "to";
    			input3.value = input3.__value;
    			attr(input3, "class", "svelte-1jczml0");
    			/*$$binding_groups*/ ctx[16][0].push(input3);
    			attr(p7, "class", "svelte-1jczml0");
    			attr(pre, "class", "svelte-1jczml0");
    			attr(button, "class", "br3 svelte-1jczml0");
    		},
    		m(target, anchor) {
    			insert(target, h1, anchor);
    			insert(target, t1, anchor);
    			insert(target, p0, anchor);
    			insert(target, t3, anchor);
    			insert(target, p1, anchor);
    			insert(target, t5, anchor);
    			insert(target, p2, anchor);
    			insert(target, t7, anchor);
    			insert(target, p3, anchor);
    			append(p3, span0);
    			append(p3, t9);
    			append(p3, input0);
    			set_input_value(input0, /*gameSize*/ ctx[0]);
    			insert(target, t10, anchor);
    			insert(target, p4, anchor);
    			append(p4, span1);
    			append(p4, t12);
    			append(p4, input1);
    			set_input_value(input1, /*speed*/ ctx[1]);
    			insert(target, t13, anchor);
    			insert(target, p5, anchor);
    			insert(target, t15, anchor);
    			insert(target, p6, anchor);
    			append(p6, input2);
    			input2.checked = input2.__value === /*showKey*/ ctx[3];
    			append(p6, t16);
    			insert(target, t17, anchor);
    			insert(target, p7, anchor);
    			append(p7, input3);
    			input3.checked = input3.__value === /*showKey*/ ctx[3];
    			append(p7, t18);
    			insert(target, t19, anchor);
    			insert(target, pre, anchor);
    			append(pre, t20);
    			insert(target, t21, anchor);
    			insert(target, button, anchor);

    			if (!mounted) {
    				dispose = [
    					listen(input0, "input", /*input0_input_handler*/ ctx[13]),
    					listen(input1, "input", /*input1_input_handler*/ ctx[14]),
    					listen(input2, "change", /*input2_change_handler*/ ctx[15]),
    					listen(input3, "change", /*input3_change_handler*/ ctx[17]),
    					listen(button, "click", /*play*/ ctx[8])
    				];

    				mounted = true;
    			}
    		},
    		p(ctx, dirty) {
    			if (dirty & /*maxSize*/ 64) {
    				attr(input0, "max", /*maxSize*/ ctx[6]);
    			}

    			if (dirty & /*gameSize*/ 1 && to_number(input0.value) !== /*gameSize*/ ctx[0]) {
    				set_input_value(input0, /*gameSize*/ ctx[0]);
    			}

    			if (dirty & /*speed*/ 2 && to_number(input1.value) !== /*speed*/ ctx[1]) {
    				set_input_value(input1, /*speed*/ ctx[1]);
    			}

    			if (dirty & /*showKey*/ 8) {
    				input2.checked = input2.__value === /*showKey*/ ctx[3];
    			}

    			if (dirty & /*showKey*/ 8) {
    				input3.checked = input3.__value === /*showKey*/ ctx[3];
    			}

    			if (dirty & /*data*/ 4 && t20_value !== (t20_value = JSON.stringify(/*data*/ ctx[2].slice(0, 2), "", 2) + "")) set_data(t20, t20_value);
    		},
    		d(detaching) {
    			if (detaching) detach(h1);
    			if (detaching) detach(t1);
    			if (detaching) detach(p0);
    			if (detaching) detach(t3);
    			if (detaching) detach(p1);
    			if (detaching) detach(t5);
    			if (detaching) detach(p2);
    			if (detaching) detach(t7);
    			if (detaching) detach(p3);
    			if (detaching) detach(t10);
    			if (detaching) detach(p4);
    			if (detaching) detach(t13);
    			if (detaching) detach(p5);
    			if (detaching) detach(t15);
    			if (detaching) detach(p6);
    			/*$$binding_groups*/ ctx[16][0].splice(/*$$binding_groups*/ ctx[16][0].indexOf(input2), 1);
    			if (detaching) detach(t17);
    			if (detaching) detach(p7);
    			/*$$binding_groups*/ ctx[16][0].splice(/*$$binding_groups*/ ctx[16][0].indexOf(input3), 1);
    			if (detaching) detach(t19);
    			if (detaching) detach(pre);
    			if (detaching) detach(t21);
    			if (detaching) detach(button);
    			mounted = false;
    			run_all(dispose);
    		}
    	};
    }

    // (491:4) {#if state === 'playing'}
    function create_if_block_1$3(ctx) {
    	let view;
    	let current;

    	view = new View({
    			props: {
    				data: /*playData*/ ctx[4],
    				speed: /*speed*/ ctx[1] * 1000
    			}
    		});

    	view.$on("finished", /*handleFinished*/ ctx[10]);

    	return {
    		c() {
    			create_component(view.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(view, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const view_changes = {};
    			if (dirty & /*playData*/ 16) view_changes.data = /*playData*/ ctx[4];
    			if (dirty & /*speed*/ 2) view_changes.speed = /*speed*/ ctx[1] * 1000;
    			view.$set(view_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(view.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(view.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(view, detaching);
    		}
    	};
    }

    // (495:4) {#if state === 'recall'}
    function create_if_block$5(ctx) {
    	let recall;
    	let current;
    	recall = new Recall({ props: { data: /*playData*/ ctx[4] } });
    	recall.$on("finished", /*finished*/ ctx[9]);

    	return {
    		c() {
    			create_component(recall.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(recall, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const recall_changes = {};
    			if (dirty & /*playData*/ 16) recall_changes.data = /*playData*/ ctx[4];
    			recall.$set(recall_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(recall.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(recall.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(recall, detaching);
    		}
    	};
    }

    function create_fragment$d(ctx) {
    	let article;
    	let header;
    	let h1;
    	let t1;
    	let button;
    	let t3;
    	let div;
    	let t4;
    	let t5;
    	let current;
    	let mounted;
    	let dispose;
    	let if_block0 = /*state*/ ctx[5] === "not-playing" && create_if_block_2$2(ctx);
    	let if_block1 = /*state*/ ctx[5] === "playing" && create_if_block_1$3(ctx);
    	let if_block2 = /*state*/ ctx[5] === "recall" && create_if_block$5(ctx);

    	return {
    		c() {
    			article = element("article");
    			header = element("header");
    			h1 = element("h1");
    			h1.textContent = "Total Recall";
    			t1 = space();
    			button = element("button");
    			button.textContent = "Close";
    			t3 = space();
    			div = element("div");
    			if (if_block0) if_block0.c();
    			t4 = space();
    			if (if_block1) if_block1.c();
    			t5 = space();
    			if (if_block2) if_block2.c();
    			attr(h1, "class", "f2 measure svelte-1jczml0");
    			attr(button, "class", "br3 svelte-1jczml0");
    			attr(header, "class", "svelte-1jczml0");
    			attr(div, "class", "pv2 svelte-1jczml0");
    			attr(article, "class", "svelte-1jczml0");
    		},
    		m(target, anchor) {
    			insert(target, article, anchor);
    			append(article, header);
    			append(header, h1);
    			append(header, t1);
    			append(header, button);
    			append(article, t3);
    			append(article, div);
    			if (if_block0) if_block0.m(div, null);
    			append(div, t4);
    			if (if_block1) if_block1.m(div, null);
    			append(div, t5);
    			if (if_block2) if_block2.m(div, null);
    			current = true;

    			if (!mounted) {
    				dispose = listen(button, "click", /*handleClose*/ ctx[7]);
    				mounted = true;
    			}
    		},
    		p(ctx, [dirty]) {
    			if (/*state*/ ctx[5] === "not-playing") {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);
    				} else {
    					if_block0 = create_if_block_2$2(ctx);
    					if_block0.c();
    					if_block0.m(div, t4);
    				}
    			} else if (if_block0) {
    				if_block0.d(1);
    				if_block0 = null;
    			}

    			if (/*state*/ ctx[5] === "playing") {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);

    					if (dirty & /*state*/ 32) {
    						transition_in(if_block1, 1);
    					}
    				} else {
    					if_block1 = create_if_block_1$3(ctx);
    					if_block1.c();
    					transition_in(if_block1, 1);
    					if_block1.m(div, t5);
    				}
    			} else if (if_block1) {
    				group_outros();

    				transition_out(if_block1, 1, 1, () => {
    					if_block1 = null;
    				});

    				check_outros();
    			}

    			if (/*state*/ ctx[5] === "recall") {
    				if (if_block2) {
    					if_block2.p(ctx, dirty);

    					if (dirty & /*state*/ 32) {
    						transition_in(if_block2, 1);
    					}
    				} else {
    					if_block2 = create_if_block$5(ctx);
    					if_block2.c();
    					transition_in(if_block2, 1);
    					if_block2.m(div, null);
    				}
    			} else if (if_block2) {
    				group_outros();

    				transition_out(if_block2, 1, 1, () => {
    					if_block2 = null;
    				});

    				check_outros();
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(if_block1);
    			transition_in(if_block2);
    			current = true;
    		},
    		o(local) {
    			transition_out(if_block1);
    			transition_out(if_block2);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(article);
    			if (if_block0) if_block0.d();
    			if (if_block1) if_block1.d();
    			if (if_block2) if_block2.d();
    			mounted = false;
    			dispose();
    		}
    	};
    }

    function instance$d($$self, $$props, $$invalidate) {
    	let maxSize;
    	let { listElement } = $$props;
    	let { playElement } = $$props;
    	let { data = [] } = $$props;
    	let { gameSize = 3 } = $$props;
    	let { speed = 1 } = $$props;
    	let showKey = "from";
    	playElement.style.display = "";
    	listElement.style.display = "none";

    	function handleClose(event) {
    		$$invalidate(12, playElement.style.display = "none", playElement);
    		$$invalidate(11, listElement.style.display = "", listElement);
    		push("/");
    	}

    	let playData = [];

    	// This needs to pick the data
    	let state = "not-playing";

    	const shuffle = (arr, key) => arr.map(a => [Math.random(), a]).sort((a, b) => a[0] - b[0]).map(a => a[1][key]);

    	function play() {
    		// reduce to 7
    		// shuffle
    		let temp = shuffle(data, showKey);

    		$$invalidate(4, playData = temp.slice(0, gameSize));
    		$$invalidate(5, state = "playing");
    	}

    	function finished(event) {
    		if (event.detail.playAgain) {
    			play();
    			return;
    		}

    		$$invalidate(5, state = "not-playing");
    	}

    	function handleFinished() {
    		$$invalidate(5, state = "recall");
    	}

    	const $$binding_groups = [[]];

    	function input0_input_handler() {
    		gameSize = to_number(this.value);
    		$$invalidate(0, gameSize);
    	}

    	function input1_input_handler() {
    		speed = to_number(this.value);
    		$$invalidate(1, speed);
    	}

    	function input2_change_handler() {
    		showKey = this.__value;
    		$$invalidate(3, showKey);
    	}

    	function input3_change_handler() {
    		showKey = this.__value;
    		$$invalidate(3, showKey);
    	}

    	$$self.$$set = $$props => {
    		if ("listElement" in $$props) $$invalidate(11, listElement = $$props.listElement);
    		if ("playElement" in $$props) $$invalidate(12, playElement = $$props.playElement);
    		if ("data" in $$props) $$invalidate(2, data = $$props.data);
    		if ("gameSize" in $$props) $$invalidate(0, gameSize = $$props.gameSize);
    		if ("speed" in $$props) $$invalidate(1, speed = $$props.speed);
    	};

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*data*/ 4) {
    			$$invalidate(6, maxSize = data.length);
    		}
    	};

    	return [
    		gameSize,
    		speed,
    		data,
    		showKey,
    		playData,
    		state,
    		maxSize,
    		handleClose,
    		play,
    		finished,
    		handleFinished,
    		listElement,
    		playElement,
    		input0_input_handler,
    		input1_input_handler,
    		input2_change_handler,
    		$$binding_groups,
    		input3_change_handler
    	];
    }

    class V2$1 extends SvelteComponent {
    	constructor(options) {
    		super();

    		init(this, options, instance$d, create_fragment$d, safe_not_equal, {
    			listElement: 11,
    			playElement: 12,
    			data: 2,
    			gameSize: 0,
    			speed: 1
    		});
    	}

    	get listElement() {
    		return this.$$.ctx[11];
    	}

    	set listElement(listElement) {
    		this.$set({ listElement });
    		flush();
    	}

    	get playElement() {
    		return this.$$.ctx[12];
    	}

    	set playElement(playElement) {
    		this.$set({ playElement });
    		flush();
    	}

    	get data() {
    		return this.$$.ctx[2];
    	}

    	set data(data) {
    		this.$set({ data });
    		flush();
    	}

    	get gameSize() {
    		return this.$$.ctx[0];
    	}

    	set gameSize(gameSize) {
    		this.$set({ gameSize });
    		flush();
    	}

    	get speed() {
    		return this.$$.ctx[1];
    	}

    	set speed(speed) {
    		this.$set({ speed });
    		flush();
    	}
    }

    /* src/components/interact/routes/total_recall_v2.svelte generated by Svelte v3.35.0 */

    function create_fragment$c(ctx) {
    	let totalrecall;
    	let current;

    	totalrecall = new V2$1({
    			props: {
    				data: /*aList*/ ctx[0].data,
    				listElement: /*listElement*/ ctx[1],
    				playElement: /*playElement*/ ctx[2]
    			}
    		});

    	return {
    		c() {
    			create_component(totalrecall.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(totalrecall, target, anchor);
    			current = true;
    		},
    		p: noop,
    		i(local) {
    			if (current) return;
    			transition_in(totalrecall.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(totalrecall.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(totalrecall, detaching);
    		}
    	};
    }

    function instance$c($$self) {
    	let aList = JSON.parse(document.querySelector("#play-data").innerHTML);
    	let listElement = document.querySelector("#list-info");
    	let playElement = document.querySelector("#play");
    	return [aList, listElement, playElement];
    }

    class Total_recall_v2 extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$c, create_fragment$c, safe_not_equal, {});
    	}
    }

    function add(node, event, handler) {
    	node.addEventListener(event, handler);
    	return () => node.removeEventListener(event, handler);
    }

    function dispatch_tap(node, x, y) {
    	node.dispatchEvent(new CustomEvent('tap', {
    		detail: { x, y }
    	}));
    }

    function handle_focus(event) {
    	const remove_keydown_handler = add(event.currentTarget, 'keydown', (event) => {
    		if (event.which === 32) dispatch_tap(event.currentTarget, null, null);
    	});

    	const remove_blur_handler = add(event.currentTarget, 'blur', (event) => {
    		remove_keydown_handler();
    		remove_blur_handler();
    	});
    }

    function is_button(node) {
    	return node.tagName === 'BUTTON' || node.type === 'button';
    }

    function tap_pointer(node) {
    	function handle_pointerdown(event) {
    		if ((node ).disabled) return;
    		const { clientX, clientY } = event;

    		const remove_pointerup_handler = add(node, 'pointerup', (event) => {
    			if (Math.abs(event.clientX - clientX) > 5) return;
    			if (Math.abs(event.clientY - clientY) > 5) return;

    			dispatch_tap(node, event.clientX, event.clientY);
    			remove_pointerup_handler();
    		});

    		setTimeout(remove_pointerup_handler, 300);
    	}

    	const remove_pointerdown_handler = add(node, 'pointerdown', handle_pointerdown);
    	const remove_focus_handler = is_button(node ) && add(node, 'focus', handle_focus);

    	return {
    		destroy() {
    			remove_pointerdown_handler();
    			remove_focus_handler && remove_focus_handler();
    		}
    	};
    }

    function tap_legacy(node) {
    	let mouse_enabled = true;
    	let mouse_timeout;

    	function handle_mousedown(event) {
    		const { clientX, clientY } = event;

    		const remove_mouseup_handler = add(node, 'mouseup', (event) => {
    			if (!mouse_enabled) return;
    			if (Math.abs(event.clientX - clientX) > 5) return;
    			if (Math.abs(event.clientY - clientY) > 5) return;

    			dispatch_tap(node, event.clientX, event.clientY);
    			remove_mouseup_handler();
    		});

    		clearTimeout(mouse_timeout);
    		setTimeout(remove_mouseup_handler, 300);
    	}

    	function handle_touchstart(event) {
    		if (event.changedTouches.length !== 1) return;
    		if ((node ).disabled) return;

    		const touch = event.changedTouches[0];
    		const { identifier, clientX, clientY } = touch;

    		const remove_touchend_handler = add(node, 'touchend', (event) => {
    			const touch = Array.from(event.changedTouches).find(t => t.identifier === identifier);
    			if (!touch) return;

    			if (Math.abs(touch.clientX - clientX) > 5) return;
    			if (Math.abs(touch.clientY - clientY) > 5) return;

    			dispatch_tap(node, touch.clientX, touch.clientY);

    			mouse_enabled = false;
    			mouse_timeout = setTimeout(() => {
    				mouse_enabled = true;
    			}, 350);
    		});

    		setTimeout(remove_touchend_handler, 300);
    	}

    	const remove_mousedown_handler = add(node, 'mousedown', handle_mousedown);
    	const remove_touchstart_handler = add(node, 'touchstart', handle_touchstart);
    	const remove_focus_handler = is_button(node ) && add(node, 'focus', handle_focus);

    	return {
    		destroy() {
    			remove_mousedown_handler();
    			remove_touchstart_handler();
    			remove_focus_handler && remove_focus_handler();
    		}
    	};
    }

    const tap = typeof PointerEvent === 'function'
    	? tap_pointer
    	: tap_legacy;

    /* src/components/interact/slideshow/v2.svelte generated by Svelte v3.35.0 */

    function create_if_block$4(ctx) {
    	let cite;
    	let t0;
    	let t1;
    	let t2;

    	return {
    		c() {
    			cite = element("cite");
    			t0 = text("- ");
    			t1 = text(/*loops*/ ctx[0]);
    			t2 = text(" (Looped over the list)");
    			attr(cite, "class", "f6 ttu tracked fs-normal svelte-1jczml0");
    		},
    		m(target, anchor) {
    			insert(target, cite, anchor);
    			append(cite, t0);
    			append(cite, t1);
    			append(cite, t2);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*loops*/ 1) set_data(t1, /*loops*/ ctx[0]);
    		},
    		d(detaching) {
    			if (detaching) detach(cite);
    		}
    	};
    }

    function create_fragment$b(ctx) {
    	let article;
    	let header;
    	let h1;
    	let t1;
    	let button0;
    	let t3;
    	let button1;
    	let t5;
    	let blockquote;
    	let div;
    	let p0;
    	let t6_value = /*show*/ ctx[1].from + "";
    	let t6;
    	let t7;
    	let p1;
    	let t8_value = /*show*/ ctx[1].to + "";
    	let t8;
    	let t9;
    	let mounted;
    	let dispose;
    	let if_block = /*loops*/ ctx[0] > 0 && create_if_block$4(ctx);

    	return {
    		c() {
    			article = element("article");
    			header = element("header");
    			h1 = element("h1");
    			h1.textContent = "Slideshow";
    			t1 = space();
    			button0 = element("button");
    			button0.textContent = "Next";
    			t3 = space();
    			button1 = element("button");
    			button1.textContent = "Close";
    			t5 = space();
    			blockquote = element("blockquote");
    			div = element("div");
    			p0 = element("p");
    			t6 = text(t6_value);
    			t7 = space();
    			p1 = element("p");
    			t8 = text(t8_value);
    			t9 = space();
    			if (if_block) if_block.c();
    			attr(h1, "class", "f2 measure svelte-1jczml0");
    			attr(button0, "class", "br3 svelte-1jczml0");
    			attr(button1, "class", "br3 svelte-1jczml0");
    			attr(header, "class", "svelte-1jczml0");
    			attr(p0, "class", "svelte-1jczml0");
    			attr(p1, "class", "svelte-1jczml0");
    			attr(div, "class", "f3 lh-copy svelte-1jczml0");
    			attr(blockquote, "class", "athelas ml0 mt4 pl4 black-90 bl bw2 b--black svelte-1jczml0");
    			attr(article, "class", "svelte-1jczml0");
    		},
    		m(target, anchor) {
    			insert(target, article, anchor);
    			append(article, header);
    			append(header, h1);
    			append(header, t1);
    			append(header, button0);
    			append(header, t3);
    			append(header, button1);
    			append(article, t5);
    			append(article, blockquote);
    			append(blockquote, div);
    			append(div, p0);
    			append(p0, t6);
    			append(div, t7);
    			append(div, p1);
    			append(p1, t8);
    			append(blockquote, t9);
    			if (if_block) if_block.m(blockquote, null);

    			if (!mounted) {
    				dispose = [
    					action_destroyer(tap.call(null, window)),
    					listen(window, "keydown", /*handleKeydown*/ ctx[4]),
    					listen(window, "tap", /*tapHandler*/ ctx[5]),
    					listen(button0, "click", /*forward*/ ctx[2]),
    					listen(button1, "click", /*handleClose*/ ctx[3])
    				];

    				mounted = true;
    			}
    		},
    		p(ctx, [dirty]) {
    			if (dirty & /*show*/ 2 && t6_value !== (t6_value = /*show*/ ctx[1].from + "")) set_data(t6, t6_value);
    			if (dirty & /*show*/ 2 && t8_value !== (t8_value = /*show*/ ctx[1].to + "")) set_data(t8, t8_value);

    			if (/*loops*/ ctx[0] > 0) {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    				} else {
    					if_block = create_if_block$4(ctx);
    					if_block.c();
    					if_block.m(blockquote, null);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(article);
    			if (if_block) if_block.d();
    			mounted = false;
    			run_all(dispose);
    		}
    	};
    }

    function instance$b($$self, $$props, $$invalidate) {
    	let { listElement } = $$props;
    	let { playElement } = $$props;
    	let { aList } = $$props;
    	playElement.style.display = "";
    	listElement.style.display = "none";
    	let loops = 0;
    	let index = -1;

    	let firstTime = {
    		from: "Welcome, to beginning,",
    		to: "click next, or use the right arrow key.."
    	};

    	let show = firstTime;
    	let nextTimeIsLoop = 0;

    	function forward(event) {
    		index += 1;

    		if (!aList.data[index]) {
    			index = 0;
    			nextTimeIsLoop = 1;
    		}

    		if (nextTimeIsLoop) {
    			$$invalidate(0, loops += 1);
    			nextTimeIsLoop = 0;
    		}

    		$$invalidate(1, show = aList.data[index]);
    	}

    	function backward() {
    		index -= 1;

    		if (index >= 0) {
    			$$invalidate(1, show = aList.data[index]);
    		} else {
    			$$invalidate(1, show = firstTime);
    			index = -1;
    		}
    	}

    	function handleClose(event) {
    		$$invalidate(7, playElement.style.display = "none", playElement);
    		$$invalidate(6, listElement.style.display = "", listElement);
    		push("/");
    	}

    	function handleKeydown(event) {
    		switch (event.code) {
    			case "ArrowLeft":
    				backward();
    				break;
    			case "Space":
    			case "ArrowRight":
    				forward();
    				break;
    			default:
    				console.log(event);
    				console.log(`pressed the ${event.key} key`);
    				break;
    		}
    	}

    	function tapHandler(event) {
    		event.preventDefault();

    		// Some sort of horrible when running in the chrome extension :(
    		let elem = document.elementFromPoint(event.detail.x, event.detail.y);

    		if (elem && elem.nodeName === "BUTTON") {
    			return false;
    		}

    		const margin = 150;
    		const width = event.target.innerWidth; // window
    		const pageX = event.detail.x; // event.pageX when touchstart
    		const left = 0 + pageX < margin;
    		const right = width - margin < pageX;

    		if (left) {
    			backward();
    			return;
    		}

    		if (right) {
    			forward();
    			return;
    		}

    		return;
    	}

    	$$self.$$set = $$props => {
    		if ("listElement" in $$props) $$invalidate(6, listElement = $$props.listElement);
    		if ("playElement" in $$props) $$invalidate(7, playElement = $$props.playElement);
    		if ("aList" in $$props) $$invalidate(8, aList = $$props.aList);
    	};

    	return [
    		loops,
    		show,
    		forward,
    		handleClose,
    		handleKeydown,
    		tapHandler,
    		listElement,
    		playElement,
    		aList
    	];
    }

    class V2 extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$b, create_fragment$b, safe_not_equal, { listElement: 6, playElement: 7, aList: 8 });
    	}

    	get listElement() {
    		return this.$$.ctx[6];
    	}

    	set listElement(listElement) {
    		this.$set({ listElement });
    		flush();
    	}

    	get playElement() {
    		return this.$$.ctx[7];
    	}

    	set playElement(playElement) {
    		this.$set({ playElement });
    		flush();
    	}

    	get aList() {
    		return this.$$.ctx[8];
    	}

    	set aList(aList) {
    		this.$set({ aList });
    		flush();
    	}
    }

    /* src/components/interact/routes/slideshow_v2.svelte generated by Svelte v3.35.0 */

    function create_fragment$a(ctx) {
    	let slideshow;
    	let current;

    	slideshow = new V2({
    			props: {
    				aList: /*aList*/ ctx[0],
    				listElement: /*listElement*/ ctx[1],
    				playElement: /*playElement*/ ctx[2]
    			}
    		});

    	return {
    		c() {
    			create_component(slideshow.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(slideshow, target, anchor);
    			current = true;
    		},
    		p: noop,
    		i(local) {
    			if (current) return;
    			transition_in(slideshow.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(slideshow.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(slideshow, detaching);
    		}
    	};
    }

    function instance$a($$self) {
    	let aList = JSON.parse(document.querySelector("#play-data").innerHTML);
    	let listElement = document.querySelector("#list-info");
    	let playElement = document.querySelector("#play");
    	return [aList, listElement, playElement];
    }

    class Slideshow_v2 extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$a, create_fragment$a, safe_not_equal, {});
    	}
    }

    async function addEntry(input) {
        return await addSpacedRepetitionEntry(input);
    }

    async function overtimeIsActive(uuid) {
        try {
            return await spacedRepetitionOvertimeIsActive(uuid);
        } catch (e) {
            console.log(e);
            return false;
        }
    }

    async function addListToOvertime(input) {
        return await spacedRepetitionAddListToOvertime(input);
    }

    async function removeListFromOvertime(userUuid, alistUuid) {
        return spacedRepetitionRemoveListFromOvertime(userUuid, alistUuid);
    }

    /* src/components/interact/spaced_repetition/overtime_active.svelte generated by Svelte v3.35.0 */

    function create_fragment$9(ctx) {
    	let p;
    	let t0;
    	let a;
    	let mounted;
    	let dispose;

    	return {
    		c() {
    			p = element("p");
    			t0 = text("All items are being added over time, click to ");
    			a = element("a");
    			a.textContent = "cancel / stop";
    			attr(a, "href", "#");
    			attr(a, "class", "link svelte-1jczml0");
    			attr(p, "class", "svelte-1jczml0");
    		},
    		m(target, anchor) {
    			insert(target, p, anchor);
    			append(p, t0);
    			append(p, a);

    			if (!mounted) {
    				dispose = listen(a, "click", prevent_default(/*stopOvertime*/ ctx[0]), { once: true });
    				mounted = true;
    			}
    		},
    		p: noop,
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(p);
    			mounted = false;
    			dispose();
    		}
    	};
    }

    function instance$9($$self, $$props, $$invalidate) {
    	let { alistUuid } = $$props;
    	let { userUuid } = $$props;
    	let { overtimeActive } = $$props;

    	async function stopOvertime() {
    		const removed = await removeListFromOvertime(userUuid, alistUuid);

    		if (removed) {
    			$$invalidate(1, overtimeActive = false);
    		}
    	}

    	$$self.$$set = $$props => {
    		if ("alistUuid" in $$props) $$invalidate(2, alistUuid = $$props.alistUuid);
    		if ("userUuid" in $$props) $$invalidate(3, userUuid = $$props.userUuid);
    		if ("overtimeActive" in $$props) $$invalidate(1, overtimeActive = $$props.overtimeActive);
    	};

    	return [stopOvertime, overtimeActive, alistUuid, userUuid];
    }

    class Overtime_active extends SvelteComponent {
    	constructor(options) {
    		super();

    		init(this, options, instance$9, create_fragment$9, safe_not_equal, {
    			alistUuid: 2,
    			userUuid: 3,
    			overtimeActive: 1
    		});
    	}

    	get alistUuid() {
    		return this.$$.ctx[2];
    	}

    	set alistUuid(alistUuid) {
    		this.$set({ alistUuid });
    		flush();
    	}

    	get userUuid() {
    		return this.$$.ctx[3];
    	}

    	set userUuid(userUuid) {
    		this.$set({ userUuid });
    		flush();
    	}

    	get overtimeActive() {
    		return this.$$.ctx[1];
    	}

    	set overtimeActive(overtimeActive) {
    		this.$set({ overtimeActive });
    		flush();
    	}
    }

    /* src/components/interact/spaced_repetition/spaced_repetition_modal.svelte generated by Svelte v3.35.0 */

    function create_if_block$3(ctx) {
    	let div0;
    	let t0;
    	let div1;
    	let t1;
    	let t2;
    	let button;
    	let current;
    	let mounted;
    	let dispose;
    	let if_block0 = /*state*/ ctx[1] === "edit" && create_if_block_2$1(ctx);
    	let if_block1 = /*state*/ ctx[1] === "feedback" && create_if_block_1$2(ctx);

    	return {
    		c() {
    			div0 = element("div");
    			t0 = space();
    			div1 = element("div");
    			if (if_block0) if_block0.c();
    			t1 = space();
    			if (if_block1) if_block1.c();
    			t2 = space();
    			button = element("button");
    			button.textContent = "cancel";
    			attr(div0, "class", "modal-background svelte-uu583n");
    			attr(button, "class", "br3 svelte-uu583n");
    			attr(div1, "class", "modal svelte-uu583n");
    			attr(div1, "role", "dialog");
    			attr(div1, "aria-modal", "true");
    		},
    		m(target, anchor) {
    			insert(target, div0, anchor);
    			insert(target, t0, anchor);
    			insert(target, div1, anchor);
    			if (if_block0) if_block0.m(div1, null);
    			append(div1, t1);
    			if (if_block1) if_block1.m(div1, null);
    			append(div1, t2);
    			append(div1, button);
    			current = true;

    			if (!mounted) {
    				dispose = [
    					listen(div0, "click", /*handleClose*/ ctx[3]),
    					listen(button, "click", /*handleClose*/ ctx[3])
    				];

    				mounted = true;
    			}
    		},
    		p(ctx, dirty) {
    			if (/*state*/ ctx[1] === "edit") {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);

    					if (dirty & /*state*/ 2) {
    						transition_in(if_block0, 1);
    					}
    				} else {
    					if_block0 = create_if_block_2$1(ctx);
    					if_block0.c();
    					transition_in(if_block0, 1);
    					if_block0.m(div1, t1);
    				}
    			} else if (if_block0) {
    				group_outros();

    				transition_out(if_block0, 1, 1, () => {
    					if_block0 = null;
    				});

    				check_outros();
    			}

    			if (/*state*/ ctx[1] === "feedback") {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);

    					if (dirty & /*state*/ 2) {
    						transition_in(if_block1, 1);
    					}
    				} else {
    					if_block1 = create_if_block_1$2(ctx);
    					if_block1.c();
    					transition_in(if_block1, 1);
    					if_block1.m(div1, t2);
    				}
    			} else if (if_block1) {
    				group_outros();

    				transition_out(if_block1, 1, 1, () => {
    					if_block1 = null;
    				});

    				check_outros();
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(if_block0);
    			transition_in(if_block1);
    			current = true;
    		},
    		o(local) {
    			transition_out(if_block0);
    			transition_out(if_block1);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div0);
    			if (detaching) detach(t0);
    			if (detaching) detach(div1);
    			if (if_block0) if_block0.d();
    			if (if_block1) if_block1.d();
    			mounted = false;
    			run_all(dispose);
    		}
    	};
    }

    // (20:4) {#if state === "edit"}
    function create_if_block_2$1(ctx) {
    	let t0;
    	let button;
    	let current;
    	let mounted;
    	let dispose;
    	const default_slot_template = /*#slots*/ ctx[5].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[4], null);

    	return {
    		c() {
    			if (default_slot) default_slot.c();
    			t0 = space();
    			button = element("button");
    			button.textContent = "Add";
    			attr(button, "class", "br3 svelte-uu583n");
    		},
    		m(target, anchor) {
    			if (default_slot) {
    				default_slot.m(target, anchor);
    			}

    			insert(target, t0, anchor);
    			insert(target, button, anchor);
    			current = true;

    			if (!mounted) {
    				dispose = listen(button, "click", /*click_handler*/ ctx[6]);
    				mounted = true;
    			}
    		},
    		p(ctx, dirty) {
    			if (default_slot) {
    				if (default_slot.p && dirty & /*$$scope*/ 16) {
    					update_slot(default_slot, default_slot_template, ctx, /*$$scope*/ ctx[4], dirty, null, null);
    				}
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (default_slot) default_slot.d(detaching);
    			if (detaching) detach(t0);
    			if (detaching) detach(button);
    			mounted = false;
    			dispose();
    		}
    	};
    }

    // (24:4) {#if state === "feedback"}
    function create_if_block_1$2(ctx) {
    	let current;
    	const default_slot_template = /*#slots*/ ctx[5].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[4], null);

    	return {
    		c() {
    			if (default_slot) default_slot.c();
    		},
    		m(target, anchor) {
    			if (default_slot) {
    				default_slot.m(target, anchor);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if (default_slot) {
    				if (default_slot.p && dirty & /*$$scope*/ 16) {
    					update_slot(default_slot, default_slot_template, ctx, /*$$scope*/ ctx[4], dirty, null, null);
    				}
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (default_slot) default_slot.d(detaching);
    		}
    	};
    }

    function create_fragment$8(ctx) {
    	let if_block_anchor;
    	let current;
    	let if_block = /*show*/ ctx[0] && create_if_block$3(ctx);

    	return {
    		c() {
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    		},
    		m(target, anchor) {
    			if (if_block) if_block.m(target, anchor);
    			insert(target, if_block_anchor, anchor);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			if (/*show*/ ctx[0]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);

    					if (dirty & /*show*/ 1) {
    						transition_in(if_block, 1);
    					}
    				} else {
    					if_block = create_if_block$3(ctx);
    					if_block.c();
    					transition_in(if_block, 1);
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			} else if (if_block) {
    				group_outros();

    				transition_out(if_block, 1, 1, () => {
    					if_block = null;
    				});

    				check_outros();
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d(detaching) {
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach(if_block_anchor);
    		}
    	};
    }

    function instance$8($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	const dispatch = createEventDispatcher();
    	let { show } = $$props;
    	let { state } = $$props;

    	function handleClose() {
    		dispatch("close");
    	}

    	const click_handler = () => dispatch("add");

    	$$self.$$set = $$props => {
    		if ("show" in $$props) $$invalidate(0, show = $$props.show);
    		if ("state" in $$props) $$invalidate(1, state = $$props.state);
    		if ("$$scope" in $$props) $$invalidate(4, $$scope = $$props.$$scope);
    	};

    	return [show, state, dispatch, handleClose, $$scope, slots, click_handler];
    }

    class Spaced_repetition_modal extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$8, create_fragment$8, safe_not_equal, { show: 0, state: 1 });
    	}

    	get show() {
    		return this.$$.ctx[0];
    	}

    	set show(show) {
    		this.$set({ show });
    		flush();
    	}

    	get state() {
    		return this.$$.ctx[1];
    	}

    	set state(state) {
    		this.$set({ state });
    		flush();
    	}
    }

    /* src/components/login_modal.svelte generated by Svelte v3.35.0 */

    function create_fragment$7(ctx) {
    	let div0;
    	let t0;
    	let div1;
    	let t1;
    	let button0;
    	let t3;
    	let button1;
    	let current;
    	let mounted;
    	let dispose;
    	const default_slot_template = /*#slots*/ ctx[2].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[1], null);

    	return {
    		c() {
    			div0 = element("div");
    			t0 = space();
    			div1 = element("div");
    			if (default_slot) default_slot.c();
    			t1 = space();
    			button0 = element("button");
    			button0.textContent = "Login";
    			t3 = space();
    			button1 = element("button");
    			button1.textContent = "cancel";
    			attr(div0, "class", "modal-background svelte-qo5uog");
    			attr(button0, "class", "br3");
    			attr(button1, "class", "br3");
    			attr(div1, "class", "modal svelte-qo5uog");
    			attr(div1, "role", "dialog");
    			attr(div1, "aria-modal", "true");
    		},
    		m(target, anchor) {
    			insert(target, div0, anchor);
    			insert(target, t0, anchor);
    			insert(target, div1, anchor);

    			if (default_slot) {
    				default_slot.m(div1, null);
    			}

    			append(div1, t1);
    			append(div1, button0);
    			append(div1, t3);
    			append(div1, button1);
    			current = true;

    			if (!mounted) {
    				dispose = [
    					listen(div0, "click", /*handleClose*/ ctx[0]),
    					listen(button0, "click", handleLogin),
    					listen(button1, "click", /*handleClose*/ ctx[0])
    				];

    				mounted = true;
    			}
    		},
    		p(ctx, [dirty]) {
    			if (default_slot) {
    				if (default_slot.p && dirty & /*$$scope*/ 2) {
    					update_slot(default_slot, default_slot_template, ctx, /*$$scope*/ ctx[1], dirty, null, null);
    				}
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div0);
    			if (detaching) detach(t0);
    			if (detaching) detach(div1);
    			if (default_slot) default_slot.d(detaching);
    			mounted = false;
    			run_all(dispose);
    		}
    	};
    }

    function handleLogin() {
    	const searchParams = new URLSearchParams();
    	const redirectUrl = window.location.href.replace(window.location.origin, "");
    	searchParams.set("redirect", redirectUrl);
    	window.location = `/login.html?${searchParams.toString()}`;
    }

    function instance$7($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	const dispatch = createEventDispatcher();

    	function handleClose() {
    		dispatch("close");
    	}

    	$$self.$$set = $$props => {
    		if ("$$scope" in $$props) $$invalidate(1, $$scope = $$props.$$scope);
    	};

    	return [handleClose, $$scope, slots];
    }

    class Login_modal extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$7, create_fragment$7, safe_not_equal, {});
    	}
    }

    /* src/components/interact/spaced_repetition/add_v2.svelte generated by Svelte v3.35.0 */

    function get_each_context$1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[27] = list[i];
    	child_ctx[29] = i;
    	return child_ctx;
    }

    // (141:0) {#if overtimeActive}
    function create_if_block_5(ctx) {
    	let div1;
    	let div0;
    	let header;
    	let button;
    	let t1;
    	let h1;
    	let t3;
    	let overtimeactive;
    	let updating_overtimeActive;
    	let current;
    	let mounted;
    	let dispose;

    	function overtimeactive_overtimeActive_binding(value) {
    		/*overtimeactive_overtimeActive_binding*/ ctx[19](value);
    	}

    	let overtimeactive_props = {
    		alistUuid: /*aList*/ ctx[0].uuid,
    		userUuid: /*userUuid*/ ctx[7]
    	};

    	if (/*overtimeActive*/ ctx[5] !== void 0) {
    		overtimeactive_props.overtimeActive = /*overtimeActive*/ ctx[5];
    	}

    	overtimeactive = new Overtime_active({ props: overtimeactive_props });
    	binding_callbacks.push(() => bind(overtimeactive, "overtimeActive", overtimeactive_overtimeActive_binding));

    	return {
    		c() {
    			div1 = element("div");
    			div0 = element("div");
    			header = element("header");
    			button = element("button");
    			button.textContent = "Close";
    			t1 = space();
    			h1 = element("h1");
    			h1.textContent = "🧠 + 💪";
    			t3 = space();
    			create_component(overtimeactive.$$.fragment);
    			attr(button, "class", "br3 svelte-1jczml0");
    			attr(h1, "class", "f2 measure svelte-1jczml0");
    			attr(h1, "title", "Spaced Repetition");
    			attr(header, "class", "svelte-1jczml0");
    			attr(div0, "class", " w-100 pa3 mr2 svelte-1jczml0");
    			attr(div1, "class", "flex flex-column svelte-1jczml0");
    		},
    		m(target, anchor) {
    			insert(target, div1, anchor);
    			append(div1, div0);
    			append(div0, header);
    			append(header, button);
    			append(header, t1);
    			append(header, h1);
    			append(header, t3);
    			mount_component(overtimeactive, header, null);
    			current = true;

    			if (!mounted) {
    				dispose = listen(button, "click", /*handleClose*/ ctx[10]);
    				mounted = true;
    			}
    		},
    		p(ctx, dirty) {
    			const overtimeactive_changes = {};
    			if (dirty & /*aList*/ 1) overtimeactive_changes.alistUuid = /*aList*/ ctx[0].uuid;
    			if (dirty & /*userUuid*/ 128) overtimeactive_changes.userUuid = /*userUuid*/ ctx[7];

    			if (!updating_overtimeActive && dirty & /*overtimeActive*/ 32) {
    				updating_overtimeActive = true;
    				overtimeactive_changes.overtimeActive = /*overtimeActive*/ ctx[5];
    				add_flush_callback(() => updating_overtimeActive = false);
    			}

    			overtimeactive.$set(overtimeactive_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(overtimeactive.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(overtimeactive.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div1);
    			destroy_component(overtimeactive);
    			mounted = false;
    			dispose();
    		}
    	};
    }

    // (153:0) {#if !overtimeActive}
    function create_if_block_1$1(ctx) {
    	let div2;
    	let div0;
    	let header;
    	let h1;
    	let t1;
    	let button0;
    	let t3;
    	let p;
    	let t4;
    	let button1;
    	let t6;
    	let div1;
    	let table;
    	let thead;
    	let t10;
    	let tbody;
    	let t11;
    	let t12;
    	let modal;
    	let current;
    	let mounted;
    	let dispose;
    	let each_value = /*aList*/ ctx[0].data;
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$1(get_each_context$1(ctx, each_value, i));
    	}

    	let if_block = /*showAddingOvertime*/ ctx[6] && create_if_block_4(ctx);

    	modal = new Spaced_repetition_modal({
    			props: {
    				show: /*show*/ ctx[4],
    				state: /*state*/ ctx[2],
    				$$slots: { default: [create_default_slot_1] },
    				$$scope: { ctx }
    			}
    		});

    	modal.$on("add", /*add*/ ctx[13]);
    	modal.$on("close", /*close*/ ctx[12]);

    	return {
    		c() {
    			div2 = element("div");
    			div0 = element("div");
    			header = element("header");
    			h1 = element("h1");
    			h1.textContent = "🧠 + 💪";
    			t1 = space();
    			button0 = element("button");
    			button0.textContent = "Close";
    			t3 = space();
    			p = element("p");
    			t4 = text("Click on the row you want to add or ");
    			button1 = element("button");
    			button1.textContent = "add all over time";
    			t6 = space();
    			div1 = element("div");
    			table = element("table");
    			thead = element("thead");

    			thead.innerHTML = `<tr class="svelte-1jczml0"><th class="fw6 bb b--black-20 pb3 tl svelte-1jczml0">From</th> 
            <th class="fw6 bb b--black-20 pb3 tl svelte-1jczml0">To</th></tr>`;

    			t10 = space();
    			tbody = element("tbody");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			t11 = space();
    			if (if_block) if_block.c();
    			t12 = space();
    			create_component(modal.$$.fragment);
    			attr(h1, "class", "f2 measure svelte-1jczml0");
    			attr(h1, "title", "Spaced Repetition");
    			attr(button0, "class", "br3 svelte-1jczml0");
    			attr(button1, "class", "br3 svelte-1jczml0");
    			attr(p, "class", "svelte-1jczml0");
    			attr(header, "class", "svelte-1jczml0");
    			attr(div0, "class", " w-100 pa3 mr2 svelte-1jczml0");
    			attr(tbody, "class", "lh-copy svelte-1jczml0");
    			attr(table, "class", "w-100 svelte-1jczml0");
    			attr(table, "cellspacing", "0");
    			attr(div1, "id", "list-data");
    			attr(div1, "class", " w-100 pa3 mr2 svelte-1jczml0");
    			attr(div2, "class", "flex flex-column svelte-1jczml0");
    		},
    		m(target, anchor) {
    			insert(target, div2, anchor);
    			append(div2, div0);
    			append(div0, header);
    			append(header, h1);
    			append(header, t1);
    			append(header, button0);
    			append(header, t3);
    			append(header, p);
    			append(p, t4);
    			append(p, button1);
    			append(div2, t6);
    			append(div2, div1);
    			append(div1, table);
    			append(table, thead);
    			append(table, t10);
    			append(table, tbody);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(tbody, null);
    			}

    			insert(target, t11, anchor);
    			if (if_block) if_block.m(target, anchor);
    			insert(target, t12, anchor);
    			mount_component(modal, target, anchor);
    			current = true;

    			if (!mounted) {
    				dispose = [
    					listen(button0, "click", /*handleClose*/ ctx[10]),
    					listen(button1, "click", prevent_default(/*addingOvertime*/ ctx[15]))
    				];

    				mounted = true;
    			}
    		},
    		p(ctx, dirty) {
    			if (dirty & /*edit, aList*/ 2049) {
    				each_value = /*aList*/ ctx[0].data;
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$1(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block$1(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(tbody, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}

    			if (/*showAddingOvertime*/ ctx[6]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);

    					if (dirty & /*showAddingOvertime*/ 64) {
    						transition_in(if_block, 1);
    					}
    				} else {
    					if_block = create_if_block_4(ctx);
    					if_block.c();
    					transition_in(if_block, 1);
    					if_block.m(t12.parentNode, t12);
    				}
    			} else if (if_block) {
    				group_outros();

    				transition_out(if_block, 1, 1, () => {
    					if_block = null;
    				});

    				check_outros();
    			}

    			const modal_changes = {};
    			if (dirty & /*show*/ 16) modal_changes.show = /*show*/ ctx[4];
    			if (dirty & /*state*/ 4) modal_changes.state = /*state*/ ctx[2];

    			if (dirty & /*$$scope, data, state, showKey*/ 1073741838) {
    				modal_changes.$$scope = { dirty, ctx };
    			}

    			modal.$set(modal_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(if_block);
    			transition_in(modal.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(if_block);
    			transition_out(modal.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div2);
    			destroy_each(each_blocks, detaching);
    			if (detaching) detach(t11);
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach(t12);
    			destroy_component(modal, detaching);
    			mounted = false;
    			run_all(dispose);
    		}
    	};
    }

    // (177:10) {#each aList.data as item, index}
    function create_each_block$1(ctx) {
    	let tr;
    	let td0;
    	let t0_value = /*item*/ ctx[27].from + "";
    	let t0;
    	let t1;
    	let td1;
    	let t2_value = /*item*/ ctx[27].to + "";
    	let t2;
    	let t3;
    	let mounted;
    	let dispose;

    	return {
    		c() {
    			tr = element("tr");
    			td0 = element("td");
    			t0 = text(t0_value);
    			t1 = space();
    			td1 = element("td");
    			t2 = text(t2_value);
    			t3 = space();
    			attr(td0, "class", "pv3 pr3 bb b--black-20 svelte-1jczml0");
    			attr(td1, "class", "pv3 pr3 bb b--black-20 svelte-1jczml0");
    			attr(tr, "data-index", /*index*/ ctx[29]);
    			attr(tr, "class", "svelte-1jczml0");
    		},
    		m(target, anchor) {
    			insert(target, tr, anchor);
    			append(tr, td0);
    			append(td0, t0);
    			append(tr, t1);
    			append(tr, td1);
    			append(td1, t2);
    			append(tr, t3);

    			if (!mounted) {
    				dispose = listen(tr, "click", /*edit*/ ctx[11]);
    				mounted = true;
    			}
    		},
    		p(ctx, dirty) {
    			if (dirty & /*aList*/ 1 && t0_value !== (t0_value = /*item*/ ctx[27].from + "")) set_data(t0, t0_value);
    			if (dirty & /*aList*/ 1 && t2_value !== (t2_value = /*item*/ ctx[27].to + "")) set_data(t2, t2_value);
    		},
    		d(detaching) {
    			if (detaching) detach(tr);
    			mounted = false;
    			dispose();
    		}
    	};
    }

    // (188:2) {#if showAddingOvertime}
    function create_if_block_4(ctx) {
    	let modal;
    	let current;

    	modal = new Spaced_repetition_modal({
    			props: {
    				show: "true",
    				state: "edit",
    				$$slots: { default: [create_default_slot_2] },
    				$$scope: { ctx }
    			}
    		});

    	modal.$on("add", /*addOvertime*/ ctx[14]);
    	modal.$on("close", /*closeOvertime*/ ctx[16]);

    	return {
    		c() {
    			create_component(modal.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(modal, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const modal_changes = {};

    			if (dirty & /*$$scope, data, showKey*/ 1073741834) {
    				modal_changes.$$scope = { dirty, ctx };
    			}

    			modal.$set(modal_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(modal.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(modal.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(modal, detaching);
    		}
    	};
    }

    // (189:4) <Modal       show="true"       state="edit"       on:add={addOvertime}       on:close={closeOvertime}     >
    function create_default_slot_2(ctx) {
    	let p0;
    	let t1;
    	let p1;
    	let input0;
    	let t2;
    	let t3;
    	let p2;
    	let input1;
    	let t4;
    	let t5;
    	let pre;
    	let t6_value = JSON.stringify(/*data*/ ctx[1], "", 2) + "";
    	let t6;
    	let mounted;
    	let dispose;

    	return {
    		c() {
    			p0 = element("p");
    			p0.innerHTML = `<span>Which to show?</span>`;
    			t1 = space();
    			p1 = element("p");
    			input0 = element("input");
    			t2 = text("\n        from");
    			t3 = space();
    			p2 = element("p");
    			input1 = element("input");
    			t4 = text("\n        to");
    			t5 = space();
    			pre = element("pre");
    			t6 = text(t6_value);
    			attr(p0, "class", "svelte-1jczml0");
    			attr(input0, "type", "radio");
    			input0.__value = "from";
    			input0.value = input0.__value;
    			attr(input0, "class", "svelte-1jczml0");
    			/*$$binding_groups*/ ctx[21][0].push(input0);
    			attr(p1, "class", "svelte-1jczml0");
    			attr(input1, "type", "radio");
    			input1.__value = "to";
    			input1.value = input1.__value;
    			attr(input1, "class", "svelte-1jczml0");
    			/*$$binding_groups*/ ctx[21][0].push(input1);
    			attr(p2, "class", "svelte-1jczml0");
    			attr(pre, "class", "svelte-1jczml0");
    		},
    		m(target, anchor) {
    			insert(target, p0, anchor);
    			insert(target, t1, anchor);
    			insert(target, p1, anchor);
    			append(p1, input0);
    			input0.checked = input0.__value === /*showKey*/ ctx[3];
    			append(p1, t2);
    			insert(target, t3, anchor);
    			insert(target, p2, anchor);
    			append(p2, input1);
    			input1.checked = input1.__value === /*showKey*/ ctx[3];
    			append(p2, t4);
    			insert(target, t5, anchor);
    			insert(target, pre, anchor);
    			append(pre, t6);

    			if (!mounted) {
    				dispose = [
    					listen(input0, "change", /*input0_change_handler*/ ctx[20]),
    					listen(input1, "change", /*input1_change_handler*/ ctx[22])
    				];

    				mounted = true;
    			}
    		},
    		p(ctx, dirty) {
    			if (dirty & /*showKey*/ 8) {
    				input0.checked = input0.__value === /*showKey*/ ctx[3];
    			}

    			if (dirty & /*showKey*/ 8) {
    				input1.checked = input1.__value === /*showKey*/ ctx[3];
    			}

    			if (dirty & /*data*/ 2 && t6_value !== (t6_value = JSON.stringify(/*data*/ ctx[1], "", 2) + "")) set_data(t6, t6_value);
    		},
    		d(detaching) {
    			if (detaching) detach(p0);
    			if (detaching) detach(t1);
    			if (detaching) detach(p1);
    			/*$$binding_groups*/ ctx[21][0].splice(/*$$binding_groups*/ ctx[21][0].indexOf(input0), 1);
    			if (detaching) detach(t3);
    			if (detaching) detach(p2);
    			/*$$binding_groups*/ ctx[21][0].splice(/*$$binding_groups*/ ctx[21][0].indexOf(input1), 1);
    			if (detaching) detach(t5);
    			if (detaching) detach(pre);
    			mounted = false;
    			run_all(dispose);
    		}
    	};
    }

    // (211:4) {#if state === "edit"}
    function create_if_block_3(ctx) {
    	let p0;
    	let t1;
    	let p1;
    	let input0;
    	let t2;
    	let t3;
    	let p2;
    	let input1;
    	let t4;
    	let t5;
    	let pre;
    	let t6_value = JSON.stringify(/*data*/ ctx[1], "", 2) + "";
    	let t6;
    	let mounted;
    	let dispose;

    	return {
    		c() {
    			p0 = element("p");
    			p0.innerHTML = `<span>Which to show?</span>`;
    			t1 = space();
    			p1 = element("p");
    			input0 = element("input");
    			t2 = text("\n        from");
    			t3 = space();
    			p2 = element("p");
    			input1 = element("input");
    			t4 = text("\n        to");
    			t5 = space();
    			pre = element("pre");
    			t6 = text(t6_value);
    			attr(p0, "class", "svelte-1jczml0");
    			attr(input0, "type", "radio");
    			input0.__value = "from";
    			input0.value = input0.__value;
    			attr(input0, "class", "svelte-1jczml0");
    			/*$$binding_groups*/ ctx[21][0].push(input0);
    			attr(p1, "class", "svelte-1jczml0");
    			attr(input1, "type", "radio");
    			input1.__value = "to";
    			input1.value = input1.__value;
    			attr(input1, "class", "svelte-1jczml0");
    			/*$$binding_groups*/ ctx[21][0].push(input1);
    			attr(p2, "class", "svelte-1jczml0");
    			attr(pre, "class", "svelte-1jczml0");
    		},
    		m(target, anchor) {
    			insert(target, p0, anchor);
    			insert(target, t1, anchor);
    			insert(target, p1, anchor);
    			append(p1, input0);
    			input0.checked = input0.__value === /*showKey*/ ctx[3];
    			append(p1, t2);
    			insert(target, t3, anchor);
    			insert(target, p2, anchor);
    			append(p2, input1);
    			input1.checked = input1.__value === /*showKey*/ ctx[3];
    			append(p2, t4);
    			insert(target, t5, anchor);
    			insert(target, pre, anchor);
    			append(pre, t6);

    			if (!mounted) {
    				dispose = [
    					listen(input0, "change", /*input0_change_handler_1*/ ctx[23]),
    					listen(input1, "change", /*input1_change_handler_1*/ ctx[24])
    				];

    				mounted = true;
    			}
    		},
    		p(ctx, dirty) {
    			if (dirty & /*showKey*/ 8) {
    				input0.checked = input0.__value === /*showKey*/ ctx[3];
    			}

    			if (dirty & /*showKey*/ 8) {
    				input1.checked = input1.__value === /*showKey*/ ctx[3];
    			}

    			if (dirty & /*data*/ 2 && t6_value !== (t6_value = JSON.stringify(/*data*/ ctx[1], "", 2) + "")) set_data(t6, t6_value);
    		},
    		d(detaching) {
    			if (detaching) detach(p0);
    			if (detaching) detach(t1);
    			if (detaching) detach(p1);
    			/*$$binding_groups*/ ctx[21][0].splice(/*$$binding_groups*/ ctx[21][0].indexOf(input0), 1);
    			if (detaching) detach(t3);
    			if (detaching) detach(p2);
    			/*$$binding_groups*/ ctx[21][0].splice(/*$$binding_groups*/ ctx[21][0].indexOf(input1), 1);
    			if (detaching) detach(t5);
    			if (detaching) detach(pre);
    			mounted = false;
    			run_all(dispose);
    		}
    	};
    }

    // (226:4) {#if state === "feedback"}
    function create_if_block_2(ctx) {
    	let p0;
    	let t1;
    	let p1;
    	let t2;
    	let t3_value = /*data*/ ctx[1].settings.when_next + "";
    	let t3;

    	return {
    		c() {
    			p0 = element("p");
    			p0.textContent = "Already in the system";
    			t1 = space();
    			p1 = element("p");
    			t2 = text("You will be reminded on ");
    			t3 = text(t3_value);
    			attr(p0, "class", "svelte-1jczml0");
    			attr(p1, "class", "svelte-1jczml0");
    		},
    		m(target, anchor) {
    			insert(target, p0, anchor);
    			insert(target, t1, anchor);
    			insert(target, p1, anchor);
    			append(p1, t2);
    			append(p1, t3);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*data*/ 2 && t3_value !== (t3_value = /*data*/ ctx[1].settings.when_next + "")) set_data(t3, t3_value);
    		},
    		d(detaching) {
    			if (detaching) detach(p0);
    			if (detaching) detach(t1);
    			if (detaching) detach(p1);
    		}
    	};
    }

    // (210:2) <Modal {show} {state} on:add={add} on:close={close}>
    function create_default_slot_1(ctx) {
    	let t;
    	let if_block1_anchor;
    	let if_block0 = /*state*/ ctx[2] === "edit" && create_if_block_3(ctx);
    	let if_block1 = /*state*/ ctx[2] === "feedback" && create_if_block_2(ctx);

    	return {
    		c() {
    			if (if_block0) if_block0.c();
    			t = space();
    			if (if_block1) if_block1.c();
    			if_block1_anchor = empty();
    		},
    		m(target, anchor) {
    			if (if_block0) if_block0.m(target, anchor);
    			insert(target, t, anchor);
    			if (if_block1) if_block1.m(target, anchor);
    			insert(target, if_block1_anchor, anchor);
    		},
    		p(ctx, dirty) {
    			if (/*state*/ ctx[2] === "edit") {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);
    				} else {
    					if_block0 = create_if_block_3(ctx);
    					if_block0.c();
    					if_block0.m(t.parentNode, t);
    				}
    			} else if (if_block0) {
    				if_block0.d(1);
    				if_block0 = null;
    			}

    			if (/*state*/ ctx[2] === "feedback") {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);
    				} else {
    					if_block1 = create_if_block_2(ctx);
    					if_block1.c();
    					if_block1.m(if_block1_anchor.parentNode, if_block1_anchor);
    				}
    			} else if (if_block1) {
    				if_block1.d(1);
    				if_block1 = null;
    			}
    		},
    		d(detaching) {
    			if (if_block0) if_block0.d(detaching);
    			if (detaching) detach(t);
    			if (if_block1) if_block1.d(detaching);
    			if (detaching) detach(if_block1_anchor);
    		}
    	};
    }

    // (233:0) {#if !loggedIn() && !loginNagClosed}
    function create_if_block$2(ctx) {
    	let loginmodal;
    	let current;

    	loginmodal = new Login_modal({
    			props: {
    				$$slots: { default: [create_default_slot$1] },
    				$$scope: { ctx }
    			}
    		});

    	loginmodal.$on("close", /*close_handler*/ ctx[25]);

    	return {
    		c() {
    			create_component(loginmodal.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(loginmodal, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const loginmodal_changes = {};

    			if (dirty & /*$$scope*/ 1073741824) {
    				loginmodal_changes.$$scope = { dirty, ctx };
    			}

    			loginmodal.$set(loginmodal_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(loginmodal.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(loginmodal.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(loginmodal, detaching);
    		}
    	};
    }

    // (234:2) <LoginModal on:close={(e) => (loginNagClosed = true)}>
    function create_default_slot$1(ctx) {
    	let p;

    	return {
    		c() {
    			p = element("p");
    			p.textContent = `${/*loginNagMessage*/ ctx[9]}`;
    			attr(p, "class", "svelte-1jczml0");
    		},
    		m(target, anchor) {
    			insert(target, p, anchor);
    		},
    		p: noop,
    		d(detaching) {
    			if (detaching) detach(p);
    		}
    	};
    }

    function create_fragment$6(ctx) {
    	let t0;
    	let t1;
    	let show_if = !loggedIn() && !/*loginNagClosed*/ ctx[8];
    	let if_block2_anchor;
    	let current;
    	let if_block0 = /*overtimeActive*/ ctx[5] && create_if_block_5(ctx);
    	let if_block1 = !/*overtimeActive*/ ctx[5] && create_if_block_1$1(ctx);
    	let if_block2 = show_if && create_if_block$2(ctx);

    	return {
    		c() {
    			if (if_block0) if_block0.c();
    			t0 = space();
    			if (if_block1) if_block1.c();
    			t1 = space();
    			if (if_block2) if_block2.c();
    			if_block2_anchor = empty();
    		},
    		m(target, anchor) {
    			if (if_block0) if_block0.m(target, anchor);
    			insert(target, t0, anchor);
    			if (if_block1) if_block1.m(target, anchor);
    			insert(target, t1, anchor);
    			if (if_block2) if_block2.m(target, anchor);
    			insert(target, if_block2_anchor, anchor);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			if (/*overtimeActive*/ ctx[5]) {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);

    					if (dirty & /*overtimeActive*/ 32) {
    						transition_in(if_block0, 1);
    					}
    				} else {
    					if_block0 = create_if_block_5(ctx);
    					if_block0.c();
    					transition_in(if_block0, 1);
    					if_block0.m(t0.parentNode, t0);
    				}
    			} else if (if_block0) {
    				group_outros();

    				transition_out(if_block0, 1, 1, () => {
    					if_block0 = null;
    				});

    				check_outros();
    			}

    			if (!/*overtimeActive*/ ctx[5]) {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);

    					if (dirty & /*overtimeActive*/ 32) {
    						transition_in(if_block1, 1);
    					}
    				} else {
    					if_block1 = create_if_block_1$1(ctx);
    					if_block1.c();
    					transition_in(if_block1, 1);
    					if_block1.m(t1.parentNode, t1);
    				}
    			} else if (if_block1) {
    				group_outros();

    				transition_out(if_block1, 1, 1, () => {
    					if_block1 = null;
    				});

    				check_outros();
    			}

    			if (dirty & /*loginNagClosed*/ 256) show_if = !loggedIn() && !/*loginNagClosed*/ ctx[8];

    			if (show_if) {
    				if (if_block2) {
    					if_block2.p(ctx, dirty);

    					if (dirty & /*loginNagClosed*/ 256) {
    						transition_in(if_block2, 1);
    					}
    				} else {
    					if_block2 = create_if_block$2(ctx);
    					if_block2.c();
    					transition_in(if_block2, 1);
    					if_block2.m(if_block2_anchor.parentNode, if_block2_anchor);
    				}
    			} else if (if_block2) {
    				group_outros();

    				transition_out(if_block2, 1, 1, () => {
    					if_block2 = null;
    				});

    				check_outros();
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(if_block0);
    			transition_in(if_block1);
    			transition_in(if_block2);
    			current = true;
    		},
    		o(local) {
    			transition_out(if_block0);
    			transition_out(if_block1);
    			transition_out(if_block2);
    			current = false;
    		},
    		d(detaching) {
    			if (if_block0) if_block0.d(detaching);
    			if (detaching) detach(t0);
    			if (if_block1) if_block1.d(detaching);
    			if (detaching) detach(t1);
    			if (if_block2) if_block2.d(detaching);
    			if (detaching) detach(if_block2_anchor);
    		}
    	};
    }

    const loginNagMessageDefault = "You need to be logged in so we can personalise your learning experience.";

    function instance$6($$self, $$props, $$invalidate) {
    	let { playElement } = $$props;
    	let { listElement } = $$props;
    	let { aList } = $$props;
    	playElement.style.display = "";
    	listElement.style.display = "none";
    	let data;
    	let state = "edit";
    	let showKey = "from";
    	let show = false;
    	let overtimeActive = false;
    	let showAddingOvertime = false;
    	let userUuid = "";
    	let loginNagMessage = loginNagMessageDefault;
    	let loginNagClosed = true;
    	let listIsEmpty = aList.data.length === 0;

    	onMount(async () => {
    		$$invalidate(7, userUuid = getConfiguration(KeyUserUuid));

    		if (loggedIn()) {
    			$$invalidate(5, overtimeActive = await overtimeIsActive(aList.uuid));
    		}
    	});

    	function handleClose(event) {
    		$$invalidate(17, playElement.style.display = "none", playElement);
    		push("/");
    	}

    	function edit(event) {
    		if (!loggedIn()) {
    			$$invalidate(8, loginNagClosed = false);
    			return;
    		}

    		const index = event.target.closest("[data-index]").getAttribute("data-index");

    		if (!index) {
    			return;
    		}

    		$$invalidate(1, data = aList.data[index]);
    		$$invalidate(4, show = true);
    	}

    	function close() {
    		$$invalidate(1, data = null);
    		$$invalidate(2, state = "edit");
    		$$invalidate(3, showKey = "from");
    		$$invalidate(4, show = false);
    	}

    	async function add(event) {
    		const input = {
    			show: data[showKey],
    			data,
    			settings: { show: showKey },
    			kind: aList.info.type
    		};

    		const response = await addEntry(input);

    		switch (response.status) {
    			case 201:
    				close();
    				break;
    			case 200:
    				$$invalidate(2, state = "feedback");
    				$$invalidate(1, data = response.body);
    				break;
    			default:
    				console.log("failed to add for spaced learning");
    				console.log(response);
    				break;
    		}
    	}

    	async function addOvertime() {
    		const input = {
    			alist_uuid: aList.uuid,
    			user_uuid: userUuid,
    			settings: { show: showKey }
    		};

    		const added = await addListToOvertime(input);

    		// TODO maybe visualise it failed
    		$$invalidate(5, overtimeActive = added);

    		closeOvertime();
    	}

    	function addingOvertime() {
    		if (listIsEmpty) {
    			notify("error", "No items to add", false);
    			return;
    		}

    		if (!loggedIn()) {
    			$$invalidate(8, loginNagClosed = false);
    			return;
    		}

    		$$invalidate(1, data = aList.data[0]);
    		$$invalidate(6, showAddingOvertime = true);
    	}

    	function closeOvertime() {
    		$$invalidate(6, showAddingOvertime = false);
    		close();
    	}

    	const $$binding_groups = [[]];

    	function overtimeactive_overtimeActive_binding(value) {
    		overtimeActive = value;
    		$$invalidate(5, overtimeActive);
    	}

    	function input0_change_handler() {
    		showKey = this.__value;
    		$$invalidate(3, showKey);
    	}

    	function input1_change_handler() {
    		showKey = this.__value;
    		$$invalidate(3, showKey);
    	}

    	function input0_change_handler_1() {
    		showKey = this.__value;
    		$$invalidate(3, showKey);
    	}

    	function input1_change_handler_1() {
    		showKey = this.__value;
    		$$invalidate(3, showKey);
    	}

    	const close_handler = e => $$invalidate(8, loginNagClosed = true);

    	$$self.$$set = $$props => {
    		if ("playElement" in $$props) $$invalidate(17, playElement = $$props.playElement);
    		if ("listElement" in $$props) $$invalidate(18, listElement = $$props.listElement);
    		if ("aList" in $$props) $$invalidate(0, aList = $$props.aList);
    	};

    	return [
    		aList,
    		data,
    		state,
    		showKey,
    		show,
    		overtimeActive,
    		showAddingOvertime,
    		userUuid,
    		loginNagClosed,
    		loginNagMessage,
    		handleClose,
    		edit,
    		close,
    		add,
    		addOvertime,
    		addingOvertime,
    		closeOvertime,
    		playElement,
    		listElement,
    		overtimeactive_overtimeActive_binding,
    		input0_change_handler,
    		$$binding_groups,
    		input1_change_handler,
    		input0_change_handler_1,
    		input1_change_handler_1,
    		close_handler
    	];
    }

    class Add_v2$1 extends SvelteComponent {
    	constructor(options) {
    		super();

    		init(this, options, instance$6, create_fragment$6, safe_not_equal, {
    			playElement: 17,
    			listElement: 18,
    			aList: 0
    		});
    	}

    	get playElement() {
    		return this.$$.ctx[17];
    	}

    	set playElement(playElement) {
    		this.$set({ playElement });
    		flush();
    	}

    	get listElement() {
    		return this.$$.ctx[18];
    	}

    	set listElement(listElement) {
    		this.$set({ listElement });
    		flush();
    	}

    	get aList() {
    		return this.$$.ctx[0];
    	}

    	set aList(aList) {
    		this.$set({ aList });
    		flush();
    	}
    }

    /* src/components/interact/routes/spaced_repetition_v2.svelte generated by Svelte v3.35.0 */

    function create_fragment$5(ctx) {
    	let spacedrepetitionadd;
    	let current;

    	spacedrepetitionadd = new Add_v2$1({
    			props: {
    				aList: /*aList*/ ctx[0],
    				listElement: /*listElement*/ ctx[1],
    				playElement: /*playElement*/ ctx[2]
    			}
    		});

    	return {
    		c() {
    			create_component(spacedrepetitionadd.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(spacedrepetitionadd, target, anchor);
    			current = true;
    		},
    		p: noop,
    		i(local) {
    			if (current) return;
    			transition_in(spacedrepetitionadd.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(spacedrepetitionadd.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(spacedrepetitionadd, detaching);
    		}
    	};
    }

    function instance$5($$self) {
    	let aList = JSON.parse(document.querySelector("#play-data").innerHTML);
    	let listElement = document.querySelector("#list-info");
    	let playElement = document.querySelector("#play");
    	return [aList, listElement, playElement];
    }

    class Spaced_repetition_v2 extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$5, create_fragment$5, safe_not_equal, {});
    	}
    }

    /* src/components/interact/interact_v2.svelte generated by Svelte v3.35.0 */

    function create_fragment$4(ctx) {
    	let router;
    	let current;
    	router = new Router({ props: { routes: /*routes*/ ctx[0] } });
    	router.$on("conditionsFailed", /*conditionsFailed_handler*/ ctx[1]);

    	return {
    		c() {
    			create_component(router.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(router, target, anchor);
    			current = true;
    		},
    		p: noop,
    		i(local) {
    			if (current) return;
    			transition_in(router.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(router.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(router, detaching);
    		}
    	};
    }

    function instance$4($$self) {
    	const routes = {
    		"/play/total_recall": Total_recall_v2,
    		"/play/slideshow": Slideshow_v2,
    		"/interact/spaced_repetition/add": Spaced_repetition_v2,
    		// Catch-all, must be last
    		"*": Nothing
    	};

    	const conditionsFailed_handler = event => replace("/");
    	return [routes, conditionsFailed_handler];
    }

    class Interact_v2 extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$4, create_fragment$4, safe_not_equal, {});
    	}
    }

    /* src/browser-extension/import-play/spaced_repetition/add_v2.svelte generated by Svelte v3.35.0 */

    function get_each_context(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[14] = list[i];
    	child_ctx[16] = i;
    	return child_ctx;
    }

    // (96:8) {#each aList.data as item, index}
    function create_each_block(ctx) {
    	let tr;
    	let td0;
    	let t0_value = /*item*/ ctx[14].from + "";
    	let t0;
    	let t1;
    	let td1;
    	let t2_value = /*item*/ ctx[14].to + "";
    	let t2;
    	let t3;
    	let mounted;
    	let dispose;

    	return {
    		c() {
    			tr = element("tr");
    			td0 = element("td");
    			t0 = text(t0_value);
    			t1 = space();
    			td1 = element("td");
    			t2 = text(t2_value);
    			t3 = space();
    			attr(td0, "class", "pv3 pr3 bb b--black-20 svelte-1jczml0");
    			attr(td1, "class", "pv3 pr3 bb b--black-20 svelte-1jczml0");
    			attr(tr, "data-index", /*index*/ ctx[16]);
    			attr(tr, "class", "svelte-1jczml0");
    		},
    		m(target, anchor) {
    			insert(target, tr, anchor);
    			append(tr, td0);
    			append(td0, t0);
    			append(tr, t1);
    			append(tr, td1);
    			append(td1, t2);
    			append(tr, t3);

    			if (!mounted) {
    				dispose = listen(tr, "click", /*edit*/ ctx[6]);
    				mounted = true;
    			}
    		},
    		p(ctx, dirty) {
    			if (dirty & /*aList*/ 1 && t0_value !== (t0_value = /*item*/ ctx[14].from + "")) set_data(t0, t0_value);
    			if (dirty & /*aList*/ 1 && t2_value !== (t2_value = /*item*/ ctx[14].to + "")) set_data(t2, t2_value);
    		},
    		d(detaching) {
    			if (detaching) detach(tr);
    			mounted = false;
    			dispose();
    		}
    	};
    }

    // (108:2) {#if state === "edit"}
    function create_if_block_1(ctx) {
    	let p0;
    	let t1;
    	let p1;
    	let input0;
    	let t2;
    	let t3;
    	let p2;
    	let input1;
    	let t4;
    	let t5;
    	let pre;
    	let t6_value = JSON.stringify(/*data*/ ctx[1], "", 2) + "";
    	let t6;
    	let mounted;
    	let dispose;

    	return {
    		c() {
    			p0 = element("p");
    			p0.innerHTML = `<span>Which to show?</span>`;
    			t1 = space();
    			p1 = element("p");
    			input0 = element("input");
    			t2 = text("\n      from");
    			t3 = space();
    			p2 = element("p");
    			input1 = element("input");
    			t4 = text("\n      to");
    			t5 = space();
    			pre = element("pre");
    			t6 = text(t6_value);
    			attr(p0, "class", "svelte-1jczml0");
    			attr(input0, "type", "radio");
    			input0.__value = "from";
    			input0.value = input0.__value;
    			attr(input0, "class", "svelte-1jczml0");
    			/*$$binding_groups*/ ctx[12][0].push(input0);
    			attr(p1, "class", "svelte-1jczml0");
    			attr(input1, "type", "radio");
    			input1.__value = "to";
    			input1.value = input1.__value;
    			attr(input1, "class", "svelte-1jczml0");
    			/*$$binding_groups*/ ctx[12][0].push(input1);
    			attr(p2, "class", "svelte-1jczml0");
    			attr(pre, "class", "svelte-1jczml0");
    		},
    		m(target, anchor) {
    			insert(target, p0, anchor);
    			insert(target, t1, anchor);
    			insert(target, p1, anchor);
    			append(p1, input0);
    			input0.checked = input0.__value === /*showKey*/ ctx[3];
    			append(p1, t2);
    			insert(target, t3, anchor);
    			insert(target, p2, anchor);
    			append(p2, input1);
    			input1.checked = input1.__value === /*showKey*/ ctx[3];
    			append(p2, t4);
    			insert(target, t5, anchor);
    			insert(target, pre, anchor);
    			append(pre, t6);

    			if (!mounted) {
    				dispose = [
    					listen(input0, "change", /*input0_change_handler*/ ctx[11]),
    					listen(input1, "change", /*input1_change_handler*/ ctx[13])
    				];

    				mounted = true;
    			}
    		},
    		p(ctx, dirty) {
    			if (dirty & /*showKey*/ 8) {
    				input0.checked = input0.__value === /*showKey*/ ctx[3];
    			}

    			if (dirty & /*showKey*/ 8) {
    				input1.checked = input1.__value === /*showKey*/ ctx[3];
    			}

    			if (dirty & /*data*/ 2 && t6_value !== (t6_value = JSON.stringify(/*data*/ ctx[1], "", 2) + "")) set_data(t6, t6_value);
    		},
    		d(detaching) {
    			if (detaching) detach(p0);
    			if (detaching) detach(t1);
    			if (detaching) detach(p1);
    			/*$$binding_groups*/ ctx[12][0].splice(/*$$binding_groups*/ ctx[12][0].indexOf(input0), 1);
    			if (detaching) detach(t3);
    			if (detaching) detach(p2);
    			/*$$binding_groups*/ ctx[12][0].splice(/*$$binding_groups*/ ctx[12][0].indexOf(input1), 1);
    			if (detaching) detach(t5);
    			if (detaching) detach(pre);
    			mounted = false;
    			run_all(dispose);
    		}
    	};
    }

    // (123:2) {#if state === "feedback"}
    function create_if_block$1(ctx) {
    	let p0;
    	let t1;
    	let p1;
    	let t2;
    	let t3_value = /*data*/ ctx[1].settings.when_next + "";
    	let t3;

    	return {
    		c() {
    			p0 = element("p");
    			p0.textContent = "Already in the system";
    			t1 = space();
    			p1 = element("p");
    			t2 = text("You will be reminded on ");
    			t3 = text(t3_value);
    			attr(p0, "class", "svelte-1jczml0");
    			attr(p1, "class", "svelte-1jczml0");
    		},
    		m(target, anchor) {
    			insert(target, p0, anchor);
    			insert(target, t1, anchor);
    			insert(target, p1, anchor);
    			append(p1, t2);
    			append(p1, t3);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*data*/ 2 && t3_value !== (t3_value = /*data*/ ctx[1].settings.when_next + "")) set_data(t3, t3_value);
    		},
    		d(detaching) {
    			if (detaching) detach(p0);
    			if (detaching) detach(t1);
    			if (detaching) detach(p1);
    		}
    	};
    }

    // (107:0) <Modal {show} {state} on:add={add} on:close={close}>
    function create_default_slot(ctx) {
    	let t;
    	let if_block1_anchor;
    	let if_block0 = /*state*/ ctx[2] === "edit" && create_if_block_1(ctx);
    	let if_block1 = /*state*/ ctx[2] === "feedback" && create_if_block$1(ctx);

    	return {
    		c() {
    			if (if_block0) if_block0.c();
    			t = space();
    			if (if_block1) if_block1.c();
    			if_block1_anchor = empty();
    		},
    		m(target, anchor) {
    			if (if_block0) if_block0.m(target, anchor);
    			insert(target, t, anchor);
    			if (if_block1) if_block1.m(target, anchor);
    			insert(target, if_block1_anchor, anchor);
    		},
    		p(ctx, dirty) {
    			if (/*state*/ ctx[2] === "edit") {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);
    				} else {
    					if_block0 = create_if_block_1(ctx);
    					if_block0.c();
    					if_block0.m(t.parentNode, t);
    				}
    			} else if (if_block0) {
    				if_block0.d(1);
    				if_block0 = null;
    			}

    			if (/*state*/ ctx[2] === "feedback") {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);
    				} else {
    					if_block1 = create_if_block$1(ctx);
    					if_block1.c();
    					if_block1.m(if_block1_anchor.parentNode, if_block1_anchor);
    				}
    			} else if (if_block1) {
    				if_block1.d(1);
    				if_block1 = null;
    			}
    		},
    		d(detaching) {
    			if (if_block0) if_block0.d(detaching);
    			if (detaching) detach(t);
    			if (if_block1) if_block1.d(detaching);
    			if (detaching) detach(if_block1_anchor);
    		}
    	};
    }

    function create_fragment$3(ctx) {
    	let div2;
    	let div0;
    	let header;
    	let h1;
    	let t1;
    	let button;
    	let t3;
    	let p;
    	let t5;
    	let div1;
    	let table;
    	let thead;
    	let t9;
    	let tbody;
    	let t10;
    	let modal;
    	let current;
    	let mounted;
    	let dispose;
    	let each_value = /*aList*/ ctx[0].data;
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
    	}

    	modal = new Spaced_repetition_modal({
    			props: {
    				show: /*show*/ ctx[4],
    				state: /*state*/ ctx[2],
    				$$slots: { default: [create_default_slot] },
    				$$scope: { ctx }
    			}
    		});

    	modal.$on("add", /*add*/ ctx[8]);
    	modal.$on("close", /*close*/ ctx[7]);

    	return {
    		c() {
    			div2 = element("div");
    			div0 = element("div");
    			header = element("header");
    			h1 = element("h1");
    			h1.textContent = "🧠 + 💪";
    			t1 = space();
    			button = element("button");
    			button.textContent = "Close";
    			t3 = space();
    			p = element("p");
    			p.textContent = "Click on the row you want to add";
    			t5 = space();
    			div1 = element("div");
    			table = element("table");
    			thead = element("thead");

    			thead.innerHTML = `<tr class="svelte-1jczml0"><th class="fw6 bb b--black-20 pb3 tl svelte-1jczml0">From</th> 
          <th class="fw6 bb b--black-20 pb3 tl svelte-1jczml0">To</th></tr>`;

    			t9 = space();
    			tbody = element("tbody");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			t10 = space();
    			create_component(modal.$$.fragment);
    			attr(h1, "class", "f2 measure svelte-1jczml0");
    			attr(h1, "title", "Spaced Repetition");
    			attr(button, "class", "br3 svelte-1jczml0");
    			attr(p, "class", "svelte-1jczml0");
    			attr(header, "class", "svelte-1jczml0");
    			attr(div0, "class", " w-100 pa3 mr2 svelte-1jczml0");
    			attr(tbody, "class", "lh-copy svelte-1jczml0");
    			attr(table, "class", "w-100 svelte-1jczml0");
    			attr(table, "cellspacing", "0");
    			attr(div1, "id", "list-data");
    			attr(div1, "class", " w-100 pa3 mr2 svelte-1jczml0");
    			attr(div2, "class", "flex flex-column svelte-1jczml0");
    		},
    		m(target, anchor) {
    			insert(target, div2, anchor);
    			append(div2, div0);
    			append(div0, header);
    			append(header, h1);
    			append(header, t1);
    			append(header, button);
    			append(header, t3);
    			append(header, p);
    			append(div2, t5);
    			append(div2, div1);
    			append(div1, table);
    			append(table, thead);
    			append(table, t9);
    			append(table, tbody);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(tbody, null);
    			}

    			insert(target, t10, anchor);
    			mount_component(modal, target, anchor);
    			current = true;

    			if (!mounted) {
    				dispose = listen(button, "click", /*handleClose*/ ctx[5]);
    				mounted = true;
    			}
    		},
    		p(ctx, [dirty]) {
    			if (dirty & /*edit, aList*/ 65) {
    				each_value = /*aList*/ ctx[0].data;
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(tbody, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}

    			const modal_changes = {};
    			if (dirty & /*show*/ 16) modal_changes.show = /*show*/ ctx[4];
    			if (dirty & /*state*/ 4) modal_changes.state = /*state*/ ctx[2];

    			if (dirty & /*$$scope, data, state, showKey*/ 131086) {
    				modal_changes.$$scope = { dirty, ctx };
    			}

    			modal.$set(modal_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(modal.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(modal.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div2);
    			destroy_each(each_blocks, detaching);
    			if (detaching) detach(t10);
    			destroy_component(modal, detaching);
    			mounted = false;
    			dispose();
    		}
    	};
    }

    function instance$3($$self, $$props, $$invalidate) {
    	let { playElement } = $$props;
    	let { listElement } = $$props;
    	let { aList } = $$props;
    	playElement.style.display = "";
    	listElement.style.display = "none";
    	let data;
    	let state = "edit";
    	let showKey = "from";
    	let show = false;

    	function handleClose(event) {
    		$$invalidate(9, playElement.style.display = "none", playElement);
    		$$invalidate(10, listElement.style.display = "", listElement);
    		push("/");
    	}

    	function edit(event) {
    		const index = event.target.closest("[data-index]").getAttribute("data-index");

    		if (!index) {
    			return;
    		}

    		$$invalidate(1, data = aList.data[index]);
    		$$invalidate(4, show = true);
    	}

    	function close() {
    		$$invalidate(1, data = null);
    		$$invalidate(2, state = "edit");
    		$$invalidate(3, showKey = "from");
    		$$invalidate(4, show = false);
    	}

    	async function add(event) {
    		const input = {
    			show: data[showKey],
    			data,
    			settings: { show: showKey },
    			kind: aList.info.type
    		};

    		const response = await addEntry(input);

    		switch (response.status) {
    			case 201:
    				notify("info", "Added");
    				close();
    				break;
    			case 200:
    				$$invalidate(2, state = "feedback");
    				$$invalidate(1, data = response.body);
    				break;
    			default:
    				console.log("failed to add for spaced learning");
    				console.log(response);
    				break;
    		}
    	}

    	const $$binding_groups = [[]];

    	function input0_change_handler() {
    		showKey = this.__value;
    		$$invalidate(3, showKey);
    	}

    	function input1_change_handler() {
    		showKey = this.__value;
    		$$invalidate(3, showKey);
    	}

    	$$self.$$set = $$props => {
    		if ("playElement" in $$props) $$invalidate(9, playElement = $$props.playElement);
    		if ("listElement" in $$props) $$invalidate(10, listElement = $$props.listElement);
    		if ("aList" in $$props) $$invalidate(0, aList = $$props.aList);
    	};

    	return [
    		aList,
    		data,
    		state,
    		showKey,
    		show,
    		handleClose,
    		edit,
    		close,
    		add,
    		playElement,
    		listElement,
    		input0_change_handler,
    		$$binding_groups,
    		input1_change_handler
    	];
    }

    class Add_v2 extends SvelteComponent {
    	constructor(options) {
    		super();

    		init(this, options, instance$3, create_fragment$3, safe_not_equal, {
    			playElement: 9,
    			listElement: 10,
    			aList: 0
    		});
    	}

    	get playElement() {
    		return this.$$.ctx[9];
    	}

    	set playElement(playElement) {
    		this.$set({ playElement });
    		flush();
    	}

    	get listElement() {
    		return this.$$.ctx[10];
    	}

    	set listElement(listElement) {
    		this.$set({ listElement });
    		flush();
    	}

    	get aList() {
    		return this.$$.ctx[0];
    	}

    	set aList(aList) {
    		this.$set({ aList });
    		flush();
    	}
    }

    /* src/browser-extension/import-play/spaced_repetition/spaced_repetition_add.svelte generated by Svelte v3.35.0 */

    function create_fragment$2(ctx) {
    	let spacedrepetitionadd;
    	let current;

    	spacedrepetitionadd = new Add_v2({
    			props: {
    				aList: /*aList*/ ctx[0],
    				listElement: /*listElement*/ ctx[1],
    				playElement: /*playElement*/ ctx[2]
    			}
    		});

    	return {
    		c() {
    			create_component(spacedrepetitionadd.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(spacedrepetitionadd, target, anchor);
    			current = true;
    		},
    		p: noop,
    		i(local) {
    			if (current) return;
    			transition_in(spacedrepetitionadd.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(spacedrepetitionadd.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(spacedrepetitionadd, detaching);
    		}
    	};
    }

    function instance$2($$self) {
    	let aList = JSON.parse(document.querySelector("#play-data").innerHTML);
    	let listElement = document.querySelector("#list-info");
    	let playElement = document.querySelector("#play");
    	return [aList, listElement, playElement];
    }

    class Spaced_repetition_add extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$2, create_fragment$2, safe_not_equal, {});
    	}
    }

    /* src/browser-extension/import-play/routes/sr.svelte generated by Svelte v3.35.0 */

    function create_fragment$1(ctx) {
    	let router;
    	let current;
    	router = new Router({ props: { routes: /*routes*/ ctx[0] } });
    	router.$on("conditionsFailed", /*conditionsFailed_handler*/ ctx[1]);

    	return {
    		c() {
    			create_component(router.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(router, target, anchor);
    			current = true;
    		},
    		p: noop,
    		i(local) {
    			if (current) return;
    			transition_in(router.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(router.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(router, detaching);
    		}
    	};
    }

    function instance$1($$self) {
    	const routes = {
    		"/spaced_repetition/add": Spaced_repetition_add
    	};

    	const conditionsFailed_handler = event => replace("/");
    	return [routes, conditionsFailed_handler];
    }

    class Sr extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$1, create_fragment$1, safe_not_equal, {});
    	}
    }

    /* src/components/banner/banner.svelte generated by Svelte v3.35.0 */

    function create_if_block(ctx) {
    	let div;
    	let svg;
    	let title;
    	let t0;
    	let path;
    	let path_d_value;
    	let t1;
    	let span;
    	let t2;
    	let mounted;
    	let dispose;

    	return {
    		c() {
    			div = element("div");
    			svg = svg_element("svg");
    			title = svg_element("title");
    			t0 = text("info icon");
    			path = svg_element("path");
    			t1 = space();
    			span = element("span");
    			t2 = text(/*message*/ ctx[3]);
    			attr(path, "d", path_d_value = /*getIcon*/ ctx[5](/*$notifications*/ ctx[1].level));
    			attr(svg, "class", "w1 svelte-e9xvwt");
    			attr(svg, "data-icon", "info");
    			attr(svg, "viewBox", "0 0 24 24");
    			set_style(svg, "fill", "currentcolor");
    			set_style(svg, "width", "2em");
    			set_style(svg, "height", "2em");
    			attr(span, "class", "lh-title ml3 svelte-e9xvwt");
    			attr(div, "class", "flex items-center justify-center pa3 navy svelte-e9xvwt");
    			toggle_class(div, "info", /*level*/ ctx[2] === "info");
    			toggle_class(div, "error", /*level*/ ctx[2] === "error");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			append(div, svg);
    			append(svg, title);
    			append(title, t0);
    			append(svg, path);
    			append(div, t1);
    			append(div, span);
    			append(span, t2);

    			if (!mounted) {
    				dispose = listen(div, "click", /*dismiss*/ ctx[4]);
    				mounted = true;
    			}
    		},
    		p(ctx, dirty) {
    			if (dirty & /*$notifications*/ 2 && path_d_value !== (path_d_value = /*getIcon*/ ctx[5](/*$notifications*/ ctx[1].level))) {
    				attr(path, "d", path_d_value);
    			}

    			if (dirty & /*message*/ 8) set_data(t2, /*message*/ ctx[3]);

    			if (dirty & /*level*/ 4) {
    				toggle_class(div, "info", /*level*/ ctx[2] === "info");
    			}

    			if (dirty & /*level*/ 4) {
    				toggle_class(div, "error", /*level*/ ctx[2] === "error");
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			mounted = false;
    			dispose();
    		}
    	};
    }

    function create_fragment(ctx) {
    	let if_block_anchor;
    	let mounted;
    	let dispose;
    	let if_block = /*show*/ ctx[0] && create_if_block(ctx);

    	return {
    		c() {
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    		},
    		m(target, anchor) {
    			if (if_block) if_block.m(target, anchor);
    			insert(target, if_block_anchor, anchor);

    			if (!mounted) {
    				dispose = listen(window, "beforeunload", /*beforeUnload*/ ctx[6]);
    				mounted = true;
    			}
    		},
    		p(ctx, [dirty]) {
    			if (/*show*/ ctx[0]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    				} else {
    					if_block = create_if_block(ctx);
    					if_block.c();
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach(if_block_anchor);
    			mounted = false;
    			dispose();
    		}
    	};
    }

    function instance($$self, $$props, $$invalidate) {
    	let level;
    	let message;
    	let sticky;
    	let show;
    	let $notifications;
    	component_subscribe($$self, notifications, $$value => $$invalidate(1, $notifications = $$value));
    	let infoIcon = `M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z`;
    	let errorIcon = `M11 15h2v2h-2zm0-8h2v6h-2zm.99-5C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z`;
    	let timer;

    	function dismiss() {
    		notifications.clear();
    		clearTimeout(timer);
    		$$invalidate(0, show = false);
    	}

    	function getIcon(level) {
    		if (level == "") {
    			return "";
    		}

    		return level == "info" ? infoIcon : errorIcon;
    	}

    	function setRemove(show, sticky) {
    		if (!show) {
    			return;
    		}

    		clearTimeout(timer);

    		if (!sticky) {
    			timer = setTimeout(() => dismiss(), 3000);
    		}
    	}

    	function beforeUnload() {
    		dismiss();
    	}

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*$notifications*/ 2) {
    			$$invalidate(2, level = $notifications.level);
    		}

    		if ($$self.$$.dirty & /*$notifications*/ 2) {
    			$$invalidate(3, message = $notifications.message);
    		}

    		if ($$self.$$.dirty & /*$notifications*/ 2) {
    			$$invalidate(7, sticky = $notifications.sticky);
    		}

    		if ($$self.$$.dirty & /*$notifications*/ 2) {
    			$$invalidate(0, show = $notifications.level != "" ? true : false);
    		}

    		if ($$self.$$.dirty & /*show, sticky*/ 129) {
    			setRemove(show, sticky);
    		}
    	};

    	return [show, $notifications, level, message, dismiss, getIcon, beforeUnload, sticky];
    }

    class Banner extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance, create_fragment, safe_not_equal, {});
    	}
    }

    new Banner({
    	target: document.querySelector("#notification-center"),
    });

    new Interact_v2({
    	target: document.querySelector("#play-screen"),
    });

    new Sr({
    	target: document.querySelector("#play-screen-sr"),
    });

    new App({
    	target: document.querySelector("#list-info"),
    });

}());
//# sourceMappingURL=bundle.js.map
