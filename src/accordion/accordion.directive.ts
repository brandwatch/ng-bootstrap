import {
	AfterContentInit,
	ChangeDetectorRef,
	Component,
	ContentChild,
	ContentChildren,
	Directive,
	EventEmitter,
	forwardRef,
	Inject,
	Input,
	OnDestroy,
	Output,
	QueryList,
	TemplateRef,
} from '@angular/core';
import { Subscription } from 'rxjs';
import { NgbAccordionConfig } from './accordion-config';
import { NgTemplateOutlet } from '@angular/common';
import { NgbCollapse } from '../collapse/collapse';

let nextId = 0;

@Component({
	selector: '[ngbAccordionBody]',
	standalone: true,
	imports: [NgTemplateOutlet],
	host: { '[class.accordion-body]': 'true' },
	template: ` <ng-template [ngTemplateOutlet]="template()"></ng-template> `,
})
export class NgbAccordionBody {
	constructor(@Inject(forwardRef(() => NgbAccordionItem)) private _item: NgbAccordionItem) {}

	@ContentChild(TemplateRef, { static: true }) bodyTpl: TemplateRef<any>;

	template() {
		return this._item.destroyOnHide === false || this._item.animatingBodyCollapse ? this.bodyTpl : null;
	}
}

@Directive({
	exportAs: 'ngbAccordionCollapse',
	standalone: true,
	selector: '[ngbAccordionCollapse]',
	host: {
		role: 'region',
		'[class.accordion-collapse]': 'true',
		'[id]': 'item.collapseId',
		'[attr.aria-labelledby]': 'item.toggleId',
	},
	hostDirectives: [
		{
			directive: NgbCollapse,
		},
	],
})
export class NgbAccordionCollapse {
	constructor(
		@Inject(forwardRef(() => NgbAccordionItem)) public item: NgbAccordionItem,
		public ngbCollapse: NgbCollapse,
	) {}
}

/**
 * A directive to put on a toggling element inside the accordion header.
 * It will register click handlers that toggle the associated panel and will handle accessibility attributes.
 *
 * This directive is used internally by the `NgbAccordionButton` directive.
 */
@Directive({
	selector: '[ngbAccordionToggle]',
	standalone: true,
	host: {
		'[id]': 'item.toggleId',
		'[class.collapsed]': 'item.collapsed',
		'[attr.aria-controls]': 'item.collapseId',
		'[attr.aria-expanded]': '!item.collapsed',
		'(click)': '!item.disabled && accordion.toggle(item.id)',
	},
})
export class NgbAccordionToggle {
	constructor(
		@Inject(forwardRef(() => NgbAccordionItem)) public item: NgbAccordionItem,
		@Inject(forwardRef(() => NgbAccordionDirective)) public accordion: NgbAccordionDirective,
	) {}
}

/**
 * A directive to put on a button element inside the accordion header.
 * If you want a custom markup for the header, you can also use the `NgbAccordionToggle` directive.
 */
@Directive({
	selector: 'button[ngbAccordionButton]',
	standalone: true,
	host: {
		'[disabled]': 'item.disabled',
		'[class.accordion-button]': 'true',
		type: 'button',
	},
	hostDirectives: [
		{
			directive: NgbAccordionToggle,
		},
	],
})
export class NgbAccordionButton {
	constructor(@Inject(forwardRef(() => NgbAccordionItem)) public item: NgbAccordionItem) {}
}

@Directive({
	selector: '[ngbAccordionHeader]',
	standalone: true,
	host: {
		role: 'heading',
		'[class.accordion-header]': 'true',
		'[class.collapsed]': 'item.collapsed',
	},
})
export class NgbAccordionHeader {
	constructor(@Inject(forwardRef(() => NgbAccordionItem)) public item: NgbAccordionItem) {}
}

/**
 * A directive that wraps an accordion item: a toggleable header + body that collapses.
 *
 * You can get hold of the `NgbAccordionItem` instance by using the `#item="ngbAccordionItem"`.
 * It provides some useful properties and methods about a single item: ex. whether it is collapsed or disabled.
 *
 * Every accordion item has a string ID that is automatically generated, unless provided explicitly.
 */
@Directive({
	selector: '[ngbAccordionItem]',
	exportAs: 'ngbAccordionItem',
	standalone: true,
	host: {
		'[class.accordion-item]': 'true',
		'[id]': 'id',
	},
})
export class NgbAccordionItem implements AfterContentInit, OnDestroy {
	constructor(
		@Inject(forwardRef(() => NgbAccordionDirective)) private _accordion: NgbAccordionDirective,
		private _cd: ChangeDetectorRef,
	) {}

	private _subscriptions: Subscription[] = [];
	private _collapsed = true;
	private _id = `ngb-accordion-item-${nextId++}`;
	private _disabled = false;

	animatingBodyCollapse = false;

	@ContentChild(NgbAccordionCollapse, { static: true }) private _collapse: NgbAccordionCollapse;

	@Input('ngbAccordionItem') set id(inputId: string) {
		if (inputId) {
			this._id = inputId;
		}
	}
	@Input() destroyOnHide = this._accordion.destroyOnHide;
	@Input() set disabled(isDisabled: boolean) {
		if (isDisabled != this.disabled) {
			this._disabled = isDisabled;
		}
	}
	@Input() set collapsed(collapsed: boolean) {
		if (this.collapsed !== collapsed) {
			this._collapsed = collapsed;
			this._cd.markForCheck(); // need if the accordion is used inside a component having OnPush change detection strategy
			// we need force CD to get template into DOM before starting animation to calculate its height correctly
			if (!this._collapsed) {
				this.animatingBodyCollapse = true;
				this._cd.detectChanges();
			}
			// we also need to make sure 'animation' flag is up-to- date
			this._collapse.ngbCollapse.animation = this._accordion.animation;
			this._collapse.ngbCollapse.collapsed = collapsed;
		}
	}

	@Output() shown = new EventEmitter<void>();
	@Output() hidden = new EventEmitter<void>();

	get collapsed(): boolean {
		return this._collapsed;
	}
	get disabled() {
		return this._disabled;
	}
	get id() {
		return `${this._id}`;
	}

	get toggleId() {
		return `${this.id}-toggle`;
	}
	get collapseId() {
		return `${this.id}-collapse`;
	}

	ngAfterContentInit(): void {
		const { ngbCollapse } = this._collapse;
		// we need to disable the animation for the first init
		ngbCollapse.animation = false;
		ngbCollapse.collapsed = this.collapsed;
		// we set the animation to the default of the accordion
		ngbCollapse.animation = this._accordion.animation;
		// event forwarding from 'ngbCollapse' to 'ngbAccordion'
		this._subscriptions.push(
			ngbCollapse.hidden.subscribe(() => {
				// when the animation finishes we can remove the template from DOM
				this.animatingBodyCollapse = false;
				this.hidden.emit();
				this._accordion.hidden.emit(this.id);
			}),
			ngbCollapse.shown.subscribe(() => {
				this.shown.emit();
				this._accordion.shown.emit(this.id);
			}),
		);
	}

	ngOnDestroy(): void {
		this._subscriptions.forEach((s) => s.unsubscribe());
	}

	toggle() {
		this.collapsed = !this.collapsed;
	}
}

@Directive({
	exportAs: 'ngbAccordion',
	standalone: true,
	selector: '[ngbAccordion]',
	host: { '[class.accordion]': 'true' },
})
export class NgbAccordionDirective {
	@ContentChildren(NgbAccordionItem, { descendants: false }) private _items: QueryList<NgbAccordionItem>;
	/**
	 * If `true`, accordion will be animated.
	 */
	@Input() animation: boolean;
	/**
	 * If `true`, only one item at the time can stay open.
	 */
	@Input() closeOthers: boolean;
	/**
	 * If `true`, the content of the AccordionBody will be removed from the DOM.
	 * This property can be overwritten at AccordionItem level
	 */
	@Input() destroyOnHide = true;

	/**
	 * An event emitted when the expanding animation is finished on the collapse. The payload is the AccordionItem id.
	 */
	@Output() shown = new EventEmitter<string>();

	/**
	 * An event emitted when the collapsing animation is finished on the collapse, and before the content of the AccordionBody is removed.
	 * The payload is the AccordionItem id.
	 */
	@Output() hidden = new EventEmitter<string>();

	constructor(config: NgbAccordionConfig) {
		this.animation = config.animation;
		this.closeOthers = config.closeOthers;
	}

	/**
	 * Toggles a panel with the given id.
	 *
	 * Has no effect if the panel is disabled.
	 */
	toggle(itemId: string) {
		const toToggle = this._getItem(itemId);
		if (toToggle) {
			const oldStateCollapsed = toToggle.collapsed;
			this._items.forEach((item) => {
				if (item === toToggle) {
					item.toggle();
				} else if (this.closeOthers && oldStateCollapsed) {
					// collapse other items if the selected item was collapsed and it will be open
					item.collapsed = true;
				}
			});
		}
	}

	/**
	 * Expands panel with the given id.
	 *
	 * If `closeOther` is `true` it will collapse the other panels.
	 */
	expand(itemId: string) {
		const toExpand = this._getItem(itemId);
		if (toExpand) {
			this._items.forEach((item) => {
				if (item === toExpand) {
					toExpand.collapsed = false;
				} else if (this.closeOthers) {
					item.collapsed = true;
				}
			});
		}
	}

	/**
	 * Expand all panels.
	 *
	 * If `closeOther` is `true` it will keep open the panel that is open, otherwise will expand the first one.
	 */
	expandAll() {
		if (this.closeOthers) {
			// we check if there is an item open and if it is not we can expand the first item
			// (otherwise we toggle do nothing)
			if (!this._items.find((item) => !item.collapsed)) {
				this._items.get(0)!.collapsed = false;
			}
		} else {
			this._items.forEach((item) => {
				item.collapsed = false;
			});
		}
	}

	/**
	 * Collapse panel with the given id.
	 *
	 * Has no effect if the panelId does not correspond to any panel.
	 */
	collapse(itemId: string) {
		const toCollapse = this._getItem(itemId);
		if (toCollapse) {
			toCollapse.collapsed = true;
		}
	}
	/**
	 * Collapse all panels.
	 */
	collapseAll() {
		this._items.forEach((item) => (item.collapsed = true));
	}

	/**
	 * Checks if a panel with a given id is expanded.
	 *
	 * If the panel does not exist will return false.
	 */
	isExpanded(panelId: string): boolean {
		const item = this._getItem(panelId);
		return item ? !item.collapsed : false;
	}

	private _getItem(itemId: string) {
		return this._items.find((item) => item.id === itemId);
	}
}