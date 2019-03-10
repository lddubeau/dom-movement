/**
 * This is required to work around a problem when extending built-in classes
 * like ``Error``. Some of the constructors for these classes return a value
 * from the constructor, which is then picked up by the constructors generated
 * by TypeScript (same with ES6 code transpiled through Babel), and this messes
 * up the inheritance chain.
 *
 * See https://github.com/Microsoft/TypeScript/issues/12123.
 */
// tslint:disable:no-any
export function fixPrototype(obj: any, parent: Function): void {
  // getPrototypeOf is supported as far back as IE9
  const oldProto = Object.getPrototypeOf(obj);

  if (oldProto !== parent) {
    // setPrototypeOf is supported as far back as IE11
    if (Object.setPrototypeOf !== undefined) {
      Object.setPrototypeOf(obj, parent.prototype);
    }
    else {
      obj.__proto__ = parent.prototype;
    }
  }
}

/**
 * This error is raised when a location is passed to a [[DOMSpace]] instance and
 * the location is not within the space.
 */
export class DOMSpaceScopeError extends Error {
  constructor() {
    super("location is not within the space");
    fixPrototype(this, DOMSpaceScopeError);
  }
}

/**
 * This error is raised when a location into an irrelevant node cannot be
 * escaped.
 */
export class CannotEscapeIrrelevantNode extends Error {
  constructor() {
    super("location is irrelevant and cannot be escaped");
    fixPrototype(this, CannotEscapeIrrelevantNode);
  }
}

/**
 * This error is raised when trying to specify a range with a minimum end point
 * which is past the maximum end point.
 */
export class ReversedRangeError extends Error {
  constructor() {
    super("tried to use a reversed range");
    fixPrototype(this, ReversedRangeError);
  }
}

/**
 * This error is raised when trying to specify a range with a minimum end point
 * which is past the maximum end point.
 */
export class ComparingDisconnectedNodes extends Error {
  constructor() {
    super("cannot compare disconnected nodes");
    fixPrototype(this, ComparingDisconnectedNodes);
  }
}

/**
 * Compare a ``[node, offset]`` location with another node which is known to be
 * a child of ``node``.
 *
 * @param node The node of the location.
 *
 * @param offset The offset of the location.
 *
 * @param child Another node to compare with ``[node, offset]`` which we already
 * know is a child of ``node``.
 *
 * @returns -1 if ``[node, offset]`` is before ``child``, 1 otherwise.
 */
function pointedCompare(node: Node, offset: number, child: Node): 1 | 0 | -1 {
  const pointed = node.childNodes[offset];
  if (pointed === undefined) {
    // Undefined means we are after all other elements. (A negative offset,
    // before all nodes, is not possible here.)
    return 1;
  }

  // We return -1 when pointed === child because the actual position we care
  // about is *inside* child. Since it is inside child, ``[node, offset]``
  // necessarily precedes that location.
  return pointed === child ||
    // tslint:disable-next-line:no-bitwise
    (pointed.compareDocumentPosition(child) &
     Node.DOCUMENT_POSITION_FOLLOWING) !== 0 ?
    -1 : // child follows pointed
    1; // child is before pointed
}

/**
 * Models a DOM location. A DOM location is a pair of node and offset.
 *
 * In theory it would be possible to support nodes of any type, but this library
 * currently only supports only ``Element``, ``Document``, ``DocumentFragment``,
 * and ``Text`` for the node.
 *
 * Consider the following example:
 *
 *    <p>I am a <b>little</b> teapot.</p>
 *
 * A location of ``(p, 0)`` points to the first text node of the top
 * level ``p`` element.
 *
 * A location of ``(p.childNodes[0], 0)`` points to the letter "I" in first text
 * node inside ``p``.
 *
 * A location of ``(p.childNodes[0], 7)`` points to the end of the first text
 * node inside ``p``. This is a location after all the text in the node.
 *
 * A location of ``(p, 1)`` points to the ``b`` element inside ``p``.
 */
export class DOMLoc {
  constructor(readonly node: Node, readonly offset: number) {
    if (offset < 0) {
      throw new Error("offset cannot be negative");
    }
  }

  static makePointingTo(node: Node): DOMLoc {
    const parent = node.parentNode;
    if (parent === null) {
      throw new Error("cannot point a node without a parent");
    }

    return new DOMLoc(parent, indexOf(parent.childNodes, node));
  }

  /**
   * @returns A new [[Location]], if the ``node``, ``offset`` pair are not equal
   * to those of this location. Otherwise, return ``this``.
   */
  newIfDifferent(node: Node, offset: number): DOMLoc {
    return (this.node === node && this.offset === offset) ? this :
      new DOMLoc(node, offset);
  }

  /**
   * This is the node to which this location points. When the location points to
   * a text node, the pointed node is the text node. When the location points to
   * anything else, the pointed node is the child node at the offset of the
   * location. This may be undefined when the location points beyond the last
   * child.
   */
  get pointedNode(): Node | null {
    const { node } = this;

    if (node.nodeType === Node.TEXT_NODE) {
      return node;
    }

    const pointed = node.childNodes[this.offset];

    return pointed === undefined ? null : pointed;
  }

  /**
   * The offset contained by this location, but normalized. An offset pointing
   * beyond the end of the node's data will be normalized to point at the end of
   * the node.
   */
  get normalizedOffset(): number {
    const { offset, node } = this;

    switch (node.nodeType) {
      case Node.DOCUMENT_NODE:
      case Node.DOCUMENT_FRAGMENT_NODE:
      case Node.ELEMENT_NODE: {
        const { childNodes: { length } } = node;

        return offset > length ? length : offset;
      }
      case Node.TEXT_NODE: {
        const { length } = node as Text;

        return offset > length ? length : offset;
      }
      default:
        throw new Error(`cannot normalize offset in a node of type: \
${node.nodeType}`);
    }
  }

  /**
   * ``true`` if the location is already normalized. ``false`` if not.
   */
  get isNormalized(): boolean {
    return this.offset === this.normalizedOffset;
  }

  /**
   * Convert a location with an offset which is out of bounds, to a location
   * with an offset within bounds.
   *
   * An offset less than 0 will be normalized to 0. An offset pointing beyond
   * the end of the node's data will be normalized to point at the end of the
   * node.
   *
   * @returns A new [[Location]], if the offset was adjusted. Otherwise, it
   * returns ``this``.
   */
  normalizeOffset(): DOMLoc {
    const normalized = this.normalizedOffset;
    const { offset, node } = this;

    return normalized === offset ? this : new DOMLoc(node, normalized);
  }

  /**
   * Determine whether this location and another location are equal.
   *
   * @returns Whether ``this`` and ``other`` are equal.
   */
  equals(other: DOMLoc | undefined | null): boolean {
    return other != null &&
      (this === other || (this.node === other.node &&
                          this.offset === other.offset));
  }

  /**
   * Compare this location with another in document order.
   *
   * @param other The other location to compare.
   *
   * @returns -1 if ``this`` is earlier than ``other``, ``0`` if the two
   * locations are equal, 1 if ``this`` is later than ``other``.
   *
   * @throws {ComparingDisconnectedNodes} If the two nodes are "disconnected"
   * (i.e. do not belong to the same document).
   */
  compare(other: DOMLoc): -1 | 0 | 1 {
    if (this.equals(other)) {
      return 0;
    }

    const { node, offset } = this;
    const { node: otherNode, offset: otherOffset } = other;

    if (node === otherNode) {
      // The case where offset === otherOffset cannot happen here because it is
      // covered above.
      return offset - otherOffset < 0 ? -1 : 1;
    }

    const result = node.compareDocumentPosition(otherNode);
    // tslint:disable:no-bitwise
    if ((result & Node.DOCUMENT_POSITION_DISCONNECTED) !== 0) {
      throw new ComparingDisconnectedNodes();
    }

    if ((result & Node.DOCUMENT_POSITION_FOLLOWING) !== 0) {
      // otherNode follows node.
      return (result & Node.DOCUMENT_POSITION_CONTAINED_BY) !== 0 ?
        // otherNode is contained by node but we still need to figure out the
        // relative positions of the node pointed by [node, offset] and
        // otherNode.
        pointedCompare(node, offset, otherNode) :
        // otherNode just follows node, no parent child relation
        -1;
    }

    if ((result & Node.DOCUMENT_POSITION_PRECEDING) === 0) {
      /* istanbul ignore next: there's no means to generate this error */
      throw new Error("neither preceding nor following: this should not \
happen");
    }

    // otherNode precedes node.
    return ((result & Node.DOCUMENT_POSITION_CONTAINS) !== 0 &&
            // otherNode contains node but we still need to figure out the
            // relative positions of the node pointed by [otherNode,
            // otherOffset] and node.
            pointedCompare(otherNode, otherOffset, node) > 0) ? -1 : 1;
    // tslint:enable:no-bitwise
  }
}

type NodeTest = (node: Node) => boolean;

// tslint:disable-next-line:no-any
function indexOf(arrayLike: any, el: any): number {
  return Array.prototype.indexOf.call(arrayLike, el);
}

/**
 * A space delimits a part of a DOM tree in which one can obtain locations.
 */
export class DOMSpace implements Iterable<DOMLoc> {
  /**
   * @param min The minimum location included in this space.
   *
   * @param max The maximum location included in this space.
   *
   * @param relevanceTest A test to determine whether a node is relevant. This
   * space does not produce locations into irrelevant nodes.
   *
   * @throws {CannotEscapeIrrelevantNode} If the container is irrelevant.
   *
   * @throw {ReversedRangeError} If ``max`` is less than ``min``.
   */
  constructor(readonly min: DOMLoc,
              readonly max: DOMLoc,
              readonly relevanceTest: NodeTest = () => true) {
    if (!(this.isRelevant(min.node) && this.isRelevant(max.node))) {
      throw new CannotEscapeIrrelevantNode();
    }

    // Man could be equal to min but it cannot be less than min.
    if (max.compare(min) < 0) {
      throw new ReversedRangeError();
    }
  }

  static makeSpanningNode(node: Node, relevanceTest?: NodeTest): DOMSpace {
    return new DOMSpace(new DOMLoc(node, 0),
                        new DOMLoc(node, node.childNodes.length),
                        relevanceTest);
  }

  /**
   * Test whether a node is contextually relevant. This method runs some stock
   * tests and if necessary calls [[Space.relevanceTest]].
   *
   * @param node The node to test.
   *
   * @returns ``true`` if the node is contextually relevant, ``false`` if not.
   */
  isRelevant(node: Node): boolean {
    const { nodeType } = node;

    return (nodeType === Node.ELEMENT_NODE || nodeType === Node.TEXT_NODE ||
            nodeType === Node.DOCUMENT_NODE ||
            nodeType === Node.DOCUMENT_FRAGMENT_NODE) &&
      this.relevanceTest(node);
  }

  /**
   * Determine whether this space contains a location.
   *
   * @param loc The location to test.
   *
   * @returns Whether the location is inside the space.
   */
  contains(loc: DOMLoc): boolean {
    try {
      return this.min.compare(loc) <= 0 && this.max.compare(loc) >= 0;
    }
    catch (ex) {
      if (ex instanceof ComparingDisconnectedNodes) {
        return false;
      }

      /* istanbul ignore next: there's currently no way to get here */
      throw ex;
    }
  }

  /**
   * Determine whether this space contains a node.
   *
   * @param node The node to test.
   *
   * @returns Whether the node is inside the space.
   */
  containsNode(node: Node): boolean {
    return node.parentNode !== null &&
      this.contains(DOMLoc.makePointingTo(node));
  }

  /**
   * If the current location is irrelevant node, then produce a new relevant
   * location pointing to the contextually irrelevant node. This is "escaping"
   * the node in the sense that the location provided by this method is pointing
   * at the irrelevant node *from outside*.
   *
   * This method also normalizes the location.
   *
   * @param location The location to escape.
   *
   * @returns If ``location`` was already relevant, and already normalized, then
   * return ``location``. Otherwise, the new relevant location.
   *
   * @throws {DOMSpaceScopeError} If ``location`` is not within the space.
   */
  escapeIrrelevantNode(location: DOMLoc): DOMLoc {
    if (!this.contains(location)) {
      throw new DOMSpaceScopeError();
    }
    const normalized = location.normalizeOffset();
    let node: Node | null = normalized.node;
    const ancestorsAndSelf: Node[] = [];
    while (node !== null && this.containsNode(node)) {
      ancestorsAndSelf.push(node);
      node = node.parentNode;
    }

    // We reverse the nodes to scan them form topmost node down to the original
    // location.
    const reversed = ancestorsAndSelf.reverse();
    const first = reversed[0];
    for (const candidate of reversed) {
      if (!this.isRelevant(candidate)) {
        // parentNode cannot be null, unless we are the first in the array.
        // tslint:disable-next-line:no-non-null-assertion
        const parentNode = candidate.parentNode!;

        // If this is the first candidate, then the parent is outside the
        // container, and we cannot use it. We don't have a good location to
        // return. This should never happen because the container is required to
        // be relevant.
        if (candidate === first) {
          /* istanbul ignore next: there's no means to generate this error */
          throw new Error("internal error: we should always be able to escape \
a location which is inside the space");
        }

        return new DOMLoc(parentNode,
                          indexOf(parentNode.childNodes, candidate));
      }
    }

    // None of the ancestors or the node itself were irrelevant, so the original
    // location was fine.
    return normalized;
  }

  /**
   * Compute the next relevant location from a starting point.
   *
   * @param start The location from which to start.
   *
   * @returns The next relevant location. Or ``null`` if there is no next
   * relevant location within the space. Remember: the *location* is relevant,
   * but can point to an irrelevant node.
   *
   * @throws {DOMSpaceScopeError} If ``start`` is not within the space.
   *
   * @throws {CannotEscapeIrrelevantNode} If ``start`` is irrelevant and cannot
   * be escaped.
   */
  next(start: DOMLoc): DOMLoc | null {
    // tslint:disable-next-line:prefer-const
    let { node, offset } = this.escapeIrrelevantNode(start);
    let loc: DOMLoc | undefined;
    switch (node.nodeType) {
      case Node.DOCUMENT_FRAGMENT_NODE:
      case Node.DOCUMENT_NODE:
      case Node.ELEMENT_NODE:
        const pointedNode = node.childNodes[offset++];
        if (pointedNode !== undefined) {
          loc = this.isRelevant(pointedNode) ?
            new DOMLoc(pointedNode, 0) :
            new DOMLoc(node, offset);
        }
        break;
      case Node.TEXT_NODE:
        if (++offset <= (node as Text).length) {
          loc = new DOMLoc(node, offset);
        }
        break;
        /* istanbul ignore next: we cannot get there */
      default:
        // Due to escapeIrrelevantNode, we should never get here.
        throw new Error(`internal error: unexpected type ${node.nodeType}`);
    }

    if (loc === undefined) {
      // If we get here, we have to move to the sibling after our starting node.

      // Note that because of the escapeIrrelevantNode at the beginning of this
      // function, the parent we encounter is necessarily relevant.
      const { parentNode } = node;
      if (parentNode === null) {
        return null;
      }

      loc = new DOMLoc(parentNode, indexOf(parentNode.childNodes, node) + 1);
    }

    return this.contains(loc) ? loc : null;
  }

  /**
   * Compute the previous relevant location from a starting point.
   *
   * @param start The location from which to start.
   *
   * @returns The previous relevant location. Or ``null`` if there is no
   * previous relevant location inside the space. Remember: the *location* is
   * relevant, but can point to an irrelevant node.
   *
   * @throws {DOMSpaceScopeError} If ``start`` is not within the space.
   *
   * @throws {CannotEscapeIrrelevantNode} If ``start`` is irrelevant and cannot
   * be escaped.
   */
  previous(start: DOMLoc): DOMLoc | null {
    // tslint:disable-next-line:prefer-const
    let { node, offset } = this.escapeIrrelevantNode(start);
    let loc: DOMLoc | undefined;
    switch (node.nodeType) {
      case Node.DOCUMENT_FRAGMENT_NODE:
      case Node.DOCUMENT_NODE:
      case Node.ELEMENT_NODE:
        const pointedNode = node.childNodes[--offset];
        if (pointedNode !== undefined) {
          loc = this.isRelevant(pointedNode) ?
            new DOMLoc(pointedNode,
                       pointedNode.nodeType === Node.TEXT_NODE ?
                       (pointedNode as Text).length :
                       pointedNode.childNodes.length) :
            new DOMLoc(node, offset);
        }
        break;
      case Node.TEXT_NODE:
        if (--offset >= 0) {
          loc = new DOMLoc(node, offset);
        }
        break;
        /* istanbul ignore next: we cannot get there */
      default:
        // Due to escapeIrrelevantNode, we should never get here.
        throw new Error(`internal error: unexpected type ${node.nodeType}`);
    }

    if (loc === undefined) {
      // If we get here, we have to move to the sibling before our starting
      // node.

      // Note that because of the escapeIrrelevantNode at the beginning of this
      // function, the parents we encounter are necessarily relevant.
      const { parentNode } = node;
      if (parentNode === null) {
        return null;
      }

      loc = new DOMLoc(parentNode, indexOf(parentNode.childNodes, node));
    }

    return this.contains(loc) ? loc : null;
  }

  /**
   * Produce an iterable iterator that iterates in document order.
   */
  *[Symbol.iterator](): IterableIterator<DOMLoc> {
    let current: DOMLoc | null = this.min;
    do {
      yield current;
      current = this.next(current);
    } while (current !== null);
  }

  /**
   * Produce an iterable iterator that iterates in reverse document order.
   */
  *reversed(): IterableIterator<DOMLoc> {
    let current: DOMLoc | null = this.max;
    do {
      yield current;
      current = this.previous(current);
    } while (current !== null);
  }
}
