import { expect, use } from "chai";
import "mocha";
// tslint:disable-next-line:match-default-export-name
import sinon from "sinon";
import sinonChai from "sinon-chai";

use(sinonChai);

import { CannotEscapeIrrelevantNode, ComparingDisconnectedNodes, DOMLoc,
         DOMSpace, DOMSpaceScopeError,
         ReversedRangeError } from "../src/dom-movement";

function *generate<T>(length: number,
                      cb: (ix: number) => T): IterableIterator<T> {
  for (let x = 0; x < length; ++x) {
    yield cb(x);
  }
}

function *generateTextLocs(textNode: Text): IterableIterator<[Node, number]> {
  // There will be a location beyond the end of the text in the node. Hence, the
  // +1 we do on the first parameter.
  yield *generate(textNode.data.length + 1,
                  x => [textNode, x] as [Node, number]);
}

// tslint:disable-next-line:no-any
function indexOf(arrayLike: any, el: any): number {
  return Array.prototype.indexOf.call(arrayLike, el);
}

describe("DOMLoc", () => {
  let doc: Document;

  before(() => {
    doc = new DOMParser().parseFromString(
      `<div><div>A <p>paragraph with <b>text</b> and stuff</p></div>\
<div>Another div.</div></div>`,
      "text/xml");
  });

  function makeElement(count: number): Element {
    const el = doc.createElement("p");
    for (let i = 0; i < count; ++i) {
      el.appendChild(doc.createElement("q"));
    }

    return el;
  }

  function makeFragment(count: number): DocumentFragment {
    const frag = doc.createDocumentFragment();
    for (let i = 0; i < count; ++i) {
      frag.appendChild(doc.createElement("q"));
    }

    return frag;
  }

  describe("#constructor()", () => {
    it("can construct", () => {
      // tslint:disable-next-line:no-unused-expression
      new DOMLoc(doc, 0);
    });

    it("throws on negative offset", () => {
      // tslint:disable-next-line:no-unused-expression
      expect(() => new DOMLoc(doc, -1))
        .to.throw(Error, "offset cannot be negative");
    });
  });

  describe(".makePointingTo()", () => {
    it("makes a location pointing to the passed node", () => {
      const div = doc.getElementsByTagName("div")[0];
      // tslint:disable-next-line:chai-vague-errors
      expect(DOMLoc.makePointingTo(div.childNodes[1])
             .equals(new DOMLoc(div, 1))).to.be.true;
    });

    it("throws if the node has no parent", () => {
      const div = doc.createElement("div");
      // tslint:disable-next-line:chai-vague-errors
      expect(() => DOMLoc.makePointingTo(div))
        .to.throw(Error, "cannot point a node without a parent");
    });
  });

  describe("#newIfDifferent()", () => {
    let loc: DOMLoc;

    before(() => {
      loc = new DOMLoc(doc, 0);
    });

    it("returns this if the node and offset are same", () => {
      expect(loc.newIfDifferent(doc, 0)).to.equal(loc);
    });

    it("returns a new location if node is different", () => {
      const newLoc = loc.newIfDifferent(doc.childNodes[0], 0);
      expect(newLoc).to.not.equal(loc);
      expect(newLoc).to.have.property("node").equal(doc.childNodes[0]);
      expect(newLoc).to.have.property("offset").equal(0);
    });

    it("returns a new location if offset is different", () => {
      const newLoc = loc.newIfDifferent(doc, 1);
      expect(newLoc).to.not.equal(loc);
      expect(newLoc).to.have.property("node").equal(doc);
      expect(newLoc).to.have.property("offset").equal(1);
    });
  });

  describe("#pointedNode", () => {
    it("evaluates to the child of a document node", () => {
      const loc = new DOMLoc(doc, 0);
      expect(loc).to.have.property("pointedNode").equal(doc.childNodes[0]);
    });

    it("evaluates to the child of an element", () => {
      // tslint:disable-next-line:no-non-null-assertion
      const p = makeElement(2);
      const loc = new DOMLoc(p, 1);
      expect(loc).to.have.property("pointedNode").equal(p.childNodes[1]);
    });

    it("evaluates to the child of a document fragment", () => {
      // tslint:disable-next-line:no-non-null-assertion
      const frag = makeFragment(2);
      const loc = new DOMLoc(frag, 1);
      expect(loc).to.have.property("pointedNode").equal(frag.childNodes[1]);
    });

    it("evaluates to the node of the location, if the node is text", () => {
      const text = doc.createTextNode("foo");
      const newLoc = new DOMLoc(text, 12);
      expect(newLoc).to.have.property("pointedNode").equal(text);
    });

    it("is null if there is no pointed node", () => {
      // tslint:disable-next-line:chai-vague-errors
      expect(new DOMLoc(doc, 1)).to.have.property("pointedNode").null;
    });
  });

  describe("#normalizedOffset", () => {
    function makeTests(what: string, getNode: () => Node): void {
      let node: Node;

      before(() => {
        node = getNode();
      });

      describe(`with a ${what} node evaluates to`, () => {
        it("the existing offset, if it is already fine", () => {
          const loc = new DOMLoc(node, 0);
          expect(loc).to.have.property("normalizedOffset").equal(loc.offset);
        });

        it("a normalized offset, if it is too large", () => {
          const loc = new DOMLoc(node, 300);
          expect(loc).to.have.property("normalizedOffset")
            .equal(node.nodeType === Node.TEXT_NODE ? (node as Text).length :
                   node.childNodes.length);
        });
      });
    }

    // tslint:disable-next-line:mocha-no-side-effect-code
    makeTests("document", () => doc);
    // tslint:disable-next-line:mocha-no-side-effect-code
    makeTests("element", () => makeElement(2));
    // tslint:disable-next-line:mocha-no-side-effect-code
    makeTests("fragment", () => makeFragment(2));
    // tslint:disable-next-line:mocha-no-side-effect-code
    makeTests("text", () => doc.createTextNode("foo"));

    it("throws if trying to normalize an unsupported node", () => {
      const node = doc.createComment("foo");
      expect(() => new DOMLoc(node, 1000).normalizedOffset)
        .to.throw(Error, "cannot normalize offset in a node of type: 8");
    });
  });

  describe("#isNormalized", () => {
    function makeTests(what: string, getNode: () => Node): void {
      let node: Node;

      before(() => {
        node = getNode();
      });

      describe(`with a ${what} node returns`, () => {
        it("true if the offset is fine", () => {
          // tslint:disable-next-line:chai-vague-errors
          expect(new DOMLoc(node, 0)).to.have.property("isNormalized").true;
        });

        it("false if the offset is too large", () => {
          // tslint:disable-next-line:chai-vague-errors
          expect(new DOMLoc(node, 300)).to.have.property("isNormalized").false;
        });
      });
    }

    // tslint:disable-next-line:mocha-no-side-effect-code
    makeTests("document", () => doc);
    // tslint:disable-next-line:mocha-no-side-effect-code
    makeTests("element", () => makeElement(2));
    // tslint:disable-next-line:mocha-no-side-effect-code
    makeTests("fragment", () => makeFragment(2));
    // tslint:disable-next-line:mocha-no-side-effect-code
    makeTests("text", () => doc.createTextNode("foo"));

    it("throws if trying to normalize an unsupported node", () => {
      const node = doc.createComment("foo");
      expect(() => new DOMLoc(node, 1000).isNormalized)
        .to.throw(Error, "cannot normalize offset in a node of type: 8");
    });
  });

  describe("#normalizeOffset()", () => {
    function makeTests(what: string, getNode: () => Node): void {
      let node: Node;

      before(() => {
        node = getNode();
      });

      describe(`with a ${what} node returns`, () => {
        it("``this`` if the offset is already fine", () => {
          const loc = new DOMLoc(node, 0);
          expect(loc.normalizeOffset()).to.equal(loc);
        });

        it("a new normalized location if the offset is too large", () => {
          const loc = new DOMLoc(node, 300);
          const newLoc = loc.normalizeOffset();
          expect(newLoc).to.not.equal(loc);
          expect(newLoc).to.have.property("node").equal(node);
          expect(newLoc).to.have.property("offset")
            .equal(node.nodeType === Node.TEXT_NODE ? (node as Text).length :
                   node.childNodes.length);
        });
      });
    }

    // tslint:disable-next-line:mocha-no-side-effect-code
    makeTests("document", () => doc);
    // tslint:disable-next-line:mocha-no-side-effect-code
    makeTests("element", () => makeElement(2));
    // tslint:disable-next-line:mocha-no-side-effect-code
    makeTests("fragment", () => makeFragment(2));
    // tslint:disable-next-line:mocha-no-side-effect-code
    makeTests("text", () => doc.createTextNode("foo"));

    it("returns this if the offset is already fine", () => {
      const loc = new DOMLoc(doc, 0);
      expect(loc.normalizeOffset()).to.equal(loc);
    });

    it("throws if trying to normalize an unsupported node", () => {
      const node = doc.createComment("foo");
      expect(() => new DOMLoc(node, 1000).normalizeOffset())
        .to.throw(Error, "cannot normalize offset in a node of type: 8");
    });
  });

  describe("#equals()", () => {
    describe("returns true", () => {
      it("if called with this", () => {
        const loc = new DOMLoc(doc, 0);
        // tslint:disable-next-line:chai-vague-errors
        expect(loc.equals(loc)).to.be.true;
      });

      it("if called with a location pointing with same node and offset", () => {
        // tslint:disable-next-line:chai-vague-errors
        expect(new DOMLoc(doc, 0).equals(new DOMLoc(doc, 0))).to.be.true;
      });
    });

    describe("returns false", () => {
      it("if called with a loc that has a different node", () => {
        // tslint:disable-next-line:chai-vague-errors no-non-null-assertion
        expect(new DOMLoc(doc, 0).equals(new DOMLoc(doc.firstChild!, 0)))
          .to.be.false;
      });

      it("if called with a loc that has a different offset", () => {
        // tslint:disable-next-line:chai-vague-errors
        expect(new DOMLoc(doc, 0).equals(new DOMLoc(doc, 1))).to.be.false;
      });
    });
  });

  describe("#compare()", () => {
    let loc: DOMLoc;
    let b: HTMLElement;
    before(() => {
      b = doc.getElementsByTagName("b")[0];
      loc = new DOMLoc(b, 0);
    });

    it("on disconnected nodes, throws", () => {
      expect(() => loc.compare(new DOMLoc(doc.createElement("div"), 0)))
        .to.throw(ComparingDisconnectedNodes,
                  "cannot compare disconnected nodes");
    });

    it("on the same object, returns 0", () => {
      expect(loc.compare(loc)).to.equal(0);
    });

    it("on equal locations, returns 0", () => {
      const loc2 = new DOMLoc(b, 0);
      expect(loc.compare(loc2)).to.equal(0);
    });

    describe("same node, different offsets", () => {
      let loc2: DOMLoc;
      before(() => {
        loc2 = new DOMLoc(b, 1);
      });

      it("on a location with later offset, returns -1", () => {
        expect(loc.compare(loc2)).to.equal(-1);
      });

      it("on a location with earlier offset, returns 1", () => {
        expect(loc2.compare(loc)).to.equal(1);
      });
    });

    describe("(siblings nodes)", () => {
      let next: DOMLoc;

      before(() => {
        // tslint:disable-next-line:no-non-null-assertion
        next = new DOMLoc(b.nextSibling!, 0);
      });

      it("returns -1 if this precedes other", () => {
        expect(loc.compare(next)).to.equal(-1);
      });

      it("returns 1 if this follows other", () => {
        expect(next.compare(loc)).to.equal(1);
      });
    });

    describe("(parent - child positions)", () => {
      let parentBefore1: DOMLoc;
      let parentBefore2: DOMLoc;
      let parentAfter: DOMLoc;
      let parentAfterEnd: DOMLoc;

      before(() => {
        // tslint:disable-next-line:no-non-null-assertion
        const parent = b.parentNode!;
        // parentBefore1 is a location that points to the b element. This is
        // a special case in the code.
        parentBefore1 = new DOMLoc(parent, indexOf(parent.childNodes, b));
        // We want to check that we are looking at the b element.
        expect(parentBefore1.pointedNode).to.equal(b);
        expect(parentBefore1.offset).to.be.greaterThan(0);
        // parentBefore2 is a location that points to a node *before* the b
        // element. This follows a different path than parentBefore1.
        parentBefore2 = new DOMLoc(parent, parentBefore1.offset - 1);
        parentAfter = new DOMLoc(parent, parentBefore1.offset + 1);
        // We want to have one case where the location points after all nodes
        // of the parent.
        parentAfterEnd = new DOMLoc(parent, parent.childNodes.length);
      });

      it("returns -1 if this is a parent position before other", () => {
        expect(parentBefore1.compare(loc)).to.equal(-1);
      });

      it("returns -1 if this is a parent position before other", () => {
        expect(parentBefore2.compare(loc)).to.equal(-1);
      });

      it("returns 1 if this is a parent position after other", () => {
        expect(parentAfter.compare(loc)).to.equal(1);
      });

      it("returns 1 if this is a parent position after other (end)", () => {
        expect(parentAfterEnd.compare(loc)).to.equal(1);
      });

      it("returns 1 if this is a child position after other", () => {
        expect(loc.compare(parentBefore1)).to.equal(1);
      });

      it("returns 1 if this is a child position after other", () => {
        expect(loc.compare(parentBefore2)).to.equal(1);
      });

      it("returns -1 if this is a child position before other", () => {
        expect(loc.compare(parentAfter)).to.equal(-1);
      });

      it("returns -1 if this is a child position before other (end)", () => {
        expect(loc.compare(parentAfterEnd)).to.equal(-1);
      });
    });
  });
});

interface DocInfo {
  doc: Document;
  expectedPositions: [Node, number][];
}

describe("DOMSpace", () => {
  let doc: Document;
  let docs: Record<string, DocInfo>;

  before(() => {
    doc = new DOMParser().parseFromString(
      `<div><div>A <p>paragraph with <b>text</b> and stuff</p></div>\
<div>Another div.</div></div>`,
      "text/xml");

    {
      docs = Object.create(null);
      const local = new DOMParser().parseFromString(
        `<div><div>A <p>paragraph with <b>text</b> and stuff</p></div>\
<div>Another div.</div></div>`,
        "text/xml");

      // tslint:disable:no-non-null-assertion
      const topDiv = local.firstElementChild!;
      const divDiv1 = local.querySelector("div>div")!;
      const divDiv1P = local.querySelector("div>div>p")!;
      const divDiv1PB = local.querySelector("div>div>p>b")!;
      const divDiv2 = local.querySelectorAll("div>div")[1];
      const expectedPositions: [Node, number][] = [
        [local, 0],
        [topDiv, 0],
        [divDiv1, 0],
        ...generateTextLocs(divDiv1.firstChild as Text),
        [divDiv1, 1],
        [divDiv1P, 0],
        ...generateTextLocs(divDiv1P.firstChild as Text),
        [divDiv1P, 1],
        [divDiv1PB, 0],
        ...generateTextLocs(divDiv1PB.firstChild as Text),
        [divDiv1PB, 1],
        [divDiv1P, 2],
        ...generateTextLocs(divDiv1P.childNodes[2] as Text),
        [divDiv1P, 3],
        [divDiv1, 2],
        [topDiv, 1],
        [divDiv2, 0],
        ...generateTextLocs(divDiv2.firstChild as Text),
        [divDiv2, 1],
        [topDiv, 2],
        [local, 1],
      ];
      docs.allRelevant = { doc: local, expectedPositions };
    }

    {
      const local = new DOMParser().parseFromString(
        `<div><div>A <p>paragraph <ig>foo</ig>with <b>text</b><ig>bar</ig> \
and stuff<ig>baz</ig></p></div><!-- baz --><div>Another div.</div></div>`,
        "text/xml");

      // tslint:disable:no-non-null-assertion
      const topDiv = local.firstElementChild!;
      const divDiv1 = local.querySelector("div>div")!;
      const divDiv1P = local.querySelector("div>div>p")!;
      const divDiv1PB = local.querySelector("div>div>p>b")!;
      const divDiv2 = local.querySelectorAll("div>div")[1];
      const expectedPositions: [Node, number][] = [
        [local, 0],
        [topDiv, 0],
        [divDiv1, 0],
        ...generateTextLocs(divDiv1.firstChild as Text),
        [divDiv1, 1],
        [divDiv1P, 0],
        ...generateTextLocs(divDiv1P.firstChild as Text),
        [divDiv1P, 1],
        [divDiv1P, 2],
        ...generateTextLocs(divDiv1P.childNodes[2] as Text),
        [divDiv1P, 3],
        [divDiv1PB, 0],
        ...generateTextLocs(divDiv1PB.firstChild as Text),
        [divDiv1PB, 1],
        [divDiv1P, 4],
        [divDiv1P, 5],
        ...generateTextLocs(divDiv1P.childNodes[5] as Text),
        [divDiv1P, 6],
        [divDiv1P, 7],
        [divDiv1, 2],
        [topDiv, 1],
        [topDiv, 2],
        [divDiv2, 0],
        ...generateTextLocs(divDiv2.firstChild as Text),
        [divDiv2, 1],
        [topDiv, 3],
        [local, 1],
      ];

      docs.irrelevant = { doc: local, expectedPositions };
    }
  });

  describe("#constructor()", () => {
    it("constructs without test", () => {
      new DOMSpace(new DOMLoc(doc, 0), new DOMLoc(doc, 1));
    });

    it("constructs with test", () => {
      new DOMSpace(new DOMLoc(doc, 0), new DOMLoc(doc, 1), () => true);
    });

    it("throws if min is irrelevant", () => {
      expect(() => new DOMSpace(
        new DOMLoc(doc, 0),
        new DOMLoc(doc.getElementsByTagName("div")[0], 0), x => x === doc))
        .to.throw(CannotEscapeIrrelevantNode,
                  "location is irrelevant and cannot be escaped");
    });

    it("throws if max is irrelevant", () => {
      const div = doc.getElementsByTagName("div")[0];
      expect(() => new DOMSpace(new DOMLoc(doc, 0), new DOMLoc(div, 0),
                                x => x === div))
        .to.throw(CannotEscapeIrrelevantNode,
                  "location is irrelevant and cannot be escaped");
    });

    it("throws if max is less than min", () => {
      expect(() => new DOMSpace(
        new DOMLoc(doc.getElementsByTagName("div")[0], 0),
        new DOMLoc(doc, 0)))
        .to.throw(ReversedRangeError, "tried to use a reversed range");
    });

    it("constructs with min equal to max", () => {
      new DOMSpace(new DOMLoc(doc, 0), new DOMLoc(doc, 0));
    });
  });

  describe(".makeSpanningNode", () => {
    it("makes a space that spans the node", () => {
      const space = DOMSpace.makeSpanningNode(doc);
      expect(space).to.have.nested.property("min.node").equal(doc);
      expect(space).to.have.nested.property("min.offset").equal(0);
      expect(space).to.have.nested.property("max.node").equal(doc);
      expect(space).to.have.nested.property("max.offset")
        .equal(doc.childNodes.length);
    });
  });

  describe("#isRelevant()", () => {
    describe("(when ``relevanceTest`` not provided)", () => {
      for (const { name, getNode } of [
        { name: "a document", getNode: () => doc },
        // tslint:disable-next-line:mocha-no-side-effect-code
        { name: "an element", getNode: () => doc.createElement("p") },
        { name: "a document fragment",
          // tslint:disable-next-line:mocha-no-side-effect-code
          getNode: () => doc.createDocumentFragment() },
        // tslint:disable-next-line:mocha-no-side-effect-code
        { name: "a text node", getNode: () => doc.createTextNode("") },
      ]) {
        it(`returns true on ${name}`, () => {
          // tslint:disable-next-line:chai-vague-errors
          expect(DOMSpace.makeSpanningNode(doc).isRelevant(getNode()))
            .to.be.true;
        });
      }

      for (const { name, getNode } of [
        // tslint:disable-next-line:mocha-no-side-effect-code
        { name: "an attribute", getNode: () => doc.createAttribute("x") },
        // tslint:disable-next-line:mocha-no-side-effect-code
        { name: "an comment", getNode: () => doc.createComment("") },
        // tslint:disable-next-line:mocha-no-side-effect-code
        { name: "a CData section", getNode: () => doc.createCDATASection("") },
        { name: "a PI",
          // tslint:disable-next-line:mocha-no-side-effect-code
          getNode: () => doc.createProcessingInstruction("a", "b") },
        // There does not seem to be a way to simple create a
        // document type node.
        // { name: "a document type", getNode: () => ??? },
      ]) {
        it(`returns false on ${name}`, () => {
          // tslint:disable-next-line:chai-vague-errors
          expect(DOMSpace.makeSpanningNode(doc).isRelevant(getNode()))
            .to.be.false;
        });
      }
    });

    describe("(when ``relevanceTest`` provided)", () => {
      it("calls ``relevanceTest`` with node passing built-in tests", () => {
        const stub = sinon.stub();
        stub.returns(true);
        const space = DOMSpace.makeSpanningNode(doc, stub);
        stub.resetHistory();
        // tslint:disable-next-line:chai-vague-errors
        expect(space.isRelevant(doc)).to.be.true;
        expect(stub).to.have.been.calledOnce.and.been.calledWith(doc);
      });

      it("returns ``relevanceTest``'s return value with node passing \
built-in tests",
         () => {
           const p = doc.getElementsByTagName("p")[0];
           const stub = sinon.stub();
           stub.returns(true);
           const space = DOMSpace.makeSpanningNode(doc, stub);
           stub.resetHistory();
           // tslint:disable-next-line:chai-vague-errors
           expect(space.isRelevant(p)).to.be.true;
           expect(stub).to.have.been.calledOnce.and.been.calledWith(p);
           // tslint:disable-next-line:chai-vague-errors
           expect(DOMSpace.makeSpanningNode(doc, node => node !== p)
                  .isRelevant(p)).to.be.false;
         });

      it("does not call ``relevanceTest`` with node failing built-in tests",
         () => {
           const stub = sinon.stub();
           stub.returns(true);
           const clone = doc.cloneNode(true);
           const comment = doc.createComment("Q");
           clone.firstChild!.appendChild(comment);
           const space = DOMSpace.makeSpanningNode(doc, stub);
           stub.resetHistory();
           // tslint:disable-next-line:chai-vague-errors
           expect(space.isRelevant(comment)).to.be.false;
           expect(stub).to.have.not.been.called;
         });
    });
  });

  describe("#contains()", () => {
    it("returns true if the location is contained", () => {
      // tslint:disable-next-line:chai-vague-errors
      expect(DOMSpace.makeSpanningNode(doc).contains(new DOMLoc(doc, 0)))
        .to.be.true;
    });

    it("returns false if the location is less than min", () => {
      const div = doc.getElementsByTagName("div")[0];
      const space = DOMSpace.makeSpanningNode(div);
      const loc = new DOMLoc(doc, 0);
      expect(space.min.compare(loc)).to.equal(1);
      expect(space.max.compare(loc)).to.equal(1);
      // tslint:disable-next-line:chai-vague-errors
      expect(space.contains(loc)).to.be.false;
    });

    it("returns false if the location is more than max", () => {
      const div = doc.getElementsByTagName("div")[0];
      const space = DOMSpace.makeSpanningNode(div);
      const loc = new DOMLoc(doc, 1);
      expect(space.min.compare(loc)).to.equal(-1);
      expect(space.max.compare(loc)).to.equal(-1);
      // tslint:disable-next-line:chai-vague-errors
      expect(space.contains(loc)).to.be.false;
    });

    it("returns false if the node is disconnected", () => {
      // tslint:disable-next-line:chai-vague-errors
      expect(DOMSpace.makeSpanningNode(doc).contains(new DOMLoc(document, 0)))
        .to.be.false;
    });
  });

  describe("#escapeIrrelevantNode()", () => {
    let b: Element;
    let loc: DOMLoc;

    before(() => {
      b = doc.getElementsByTagName("b")[0];
      loc = new DOMLoc(b, 0);
    });

    describe("when start is not in a contextually irrelevant node", () => {
      it("and start is normalized, returns the same location", () => {
        expect(DOMSpace.makeSpanningNode(doc).escapeIrrelevantNode(loc))
          .to.equal(loc);
      });

      it("and start is not normalized, returns a normalized location", () => {
        const denormalized = new DOMLoc(b, 9999);
        const normalized = DOMSpace.makeSpanningNode(doc)
          .escapeIrrelevantNode(denormalized);
        expect(normalized).to.have.property("node").equal(b);
        expect(normalized).to.have.property("offset").equal(1);
      });

      it("but the node is not in the space, raise an exception", () => {
        const outside = new DOMLoc(doc.createTextNode("foo"), 0);
        expect(() => DOMSpace.makeSpanningNode(doc)
               .escapeIrrelevantNode(outside))
          .to.throw(DOMSpaceScopeError, "location is not within the space");
      });
    });

    describe("when start is in a contextually irrelevant node", () => {
      it("returns the parent of the topmost irrelevant ancestor", () => {
        const p = doc.getElementsByTagName("p")[0];
        const div = doc.querySelector("div>div");
        // tslint:disable-next-line:chai-vague-errors
        expect(div).to.not.be.null;

        // We use two kind of relevance tests.

        // The first test makes it so that the p element and all the nodes in it
        // are individually flagged as irrelevant.
        let escaped = DOMSpace.makeSpanningNode(doc, node => !p.contains(node))
          .escapeIrrelevantNode(loc);
        expect(escaped).to.have.property("node").equal(div);
        expect(escaped).to.have.property("offset").equal(1);

        // The second test makes it so that **only** the p elment is flagged as
        // irrelevant. The nodes in it would pass the relevance test but are
        // ultimately irrelevant because their parent is.
        escaped = DOMSpace.makeSpanningNode(doc, node => node !== p)
          .escapeIrrelevantNode(loc);
        expect(escaped).to.have.property("node").equal(div);
        expect(escaped).to.have.property("offset").equal(1);
      });
    });
  });

  function expectPositions(span: Document | { min: DOMLoc; max: DOMLoc },
                           method: "next" | "previous",
                           expectedPositions: [Node, number][],
                           relevanceTest?: (node: Node) => boolean): void {
    const space = span instanceof Document ?
      DOMSpace.makeSpanningNode(span, relevanceTest) :
      new DOMSpace(span.min, span.max, relevanceTest);
    // tslint:disable-next-line:no-non-null-assertion
    let cur = new DOMLoc(...expectedPositions[0]);
    for (let ix = 1; ix < expectedPositions.length; ++ix) {
      const next = new DOMLoc(...expectedPositions[ix]);
      expect(space[method](cur), `at ${ix}`).to.deep.equal(next);
      cur = next;
    }

    // tslint:disable-next-line:chai-vague-errors
    expect(space[method](cur)).to.be.null;
  }

  describe("#next()", () => {
    it("moves forward (whole document)", () => {
      const { doc: local, expectedPositions } = docs.allRelevant;
      expectPositions(local, "next", expectedPositions);
    });

    it("moves forward (arbitrary span)", () => {
      const { doc: local, expectedPositions } = docs.allRelevant;
      const divDiv1P = local.querySelector("div>div>p")!;
      const divDiv2 = local.querySelectorAll("div>div")[1];
      const min = new DOMLoc(divDiv1P, 0);
      const max = new DOMLoc(divDiv2.firstChild!, 3);
      const minIndex = expectedPositions
        .findIndex(([node, offset]) => node === min.node &&
                   offset === min.offset);
      const maxIndex = expectedPositions
        .findIndex(([node, offset]) => node === max.node &&
                   offset === max.offset);
      expect(minIndex).to.be.greaterThan(-1);
      expect(maxIndex).to.be.greaterThan(minIndex);
      expectPositions({ min, max }, "next",
                      expectedPositions.slice(minIndex, maxIndex + 1));
    });

    it("moves forward in document fragment", () => {
      const frag = doc.createDocumentFragment();
      const space = DOMSpace.makeSpanningNode(frag, () => true);
      const loc = new DOMLoc(frag, 0);
      // tslint:disable-next-line:chai-vague-errors
      expect(space.next(loc)).to.be.null;
    });

    it("moves forward over contextually irrelevant nodes", () => {
      const { doc: local, expectedPositions } = docs.irrelevant;
      expectPositions(local, "next", expectedPositions,
                      node => (node as Element).tagName !== "ig");
    });

    it("moves forward outside contextually irrelevant nodes", () => {
      const local = docs.irrelevant.doc;

      const igs = local.getElementsByTagName("ig");
      const divDiv1P = local.querySelector("div>div>p")!;

      const space =
        DOMSpace.makeSpanningNode(local,
                                  node => (node as Element).tagName !== "ig");
      const afterIg1 = new DOMLoc(divDiv1P, 2);
      for (const pair of [
        [igs[0], 0],
        [igs[0], 1],
        [igs[0].firstChild!, 0],
        [igs[0].firstChild!, (igs[0].firstChild! as Text).data.length],
      ]  as [Node, number][]) {
        expect(space.next(new DOMLoc(...pair))).to.deep.equal(afterIg1);
      }

      const afterIg2 = new DOMLoc(divDiv1P, 5);
      for (const pair of [
        [igs[1], 0],
        [igs[1], 1],
        [igs[1].firstChild!, 0],
        [igs[1].firstChild!, (igs[1].firstChild! as Text).data.length],
      ]  as [Node, number][]) {
        expect(space.next(new DOMLoc(...pair))).to.deep.equal(afterIg2);
      }
    });

    it("when passed a node outside the space, raises an exception", () => {
      // tslint:disable-next-line:chai-vague-errors
      expect(() => DOMSpace.makeSpanningNode(doc)
             .next(new DOMLoc(doc.createTextNode("foo"), 0)))
        .to.throw(DOMSpaceScopeError, "location is not within the space");
    });
  });

  describe("#previous()", () => {
    it("moves backwards (whole document)", () => {
      const { doc: local, expectedPositions } = docs.allRelevant;
      expectPositions(local, "previous", expectedPositions.slice().reverse());
    });

    it("moves backwards (arbitrary span)", () => {
      const { doc: local, expectedPositions } = docs.allRelevant;
      const divDiv1P = local.querySelector("div>div>p")!;
      const divDiv2 = local.querySelectorAll("div>div")[1];
      const min = new DOMLoc(divDiv1P, 0);
      const max = new DOMLoc(divDiv2.firstChild!, 3);
      const minIndex = expectedPositions
        .findIndex(([node, offset]) => node === min.node &&
                   offset === min.offset);
      const maxIndex = expectedPositions
        .findIndex(([node, offset]) => node === max.node &&
                   offset === max.offset);
      expect(minIndex).to.be.greaterThan(-1);
      expect(maxIndex).to.be.greaterThan(minIndex);
      expectPositions({ min, max }, "previous",
                      expectedPositions.slice(minIndex, maxIndex + 1)
                      .reverse());
    });

    it("moves backwards in document fragment", () => {
      const frag = doc.createDocumentFragment();
      const space = DOMSpace.makeSpanningNode(frag, () => true);
      const loc = new DOMLoc(frag, 0);
      // tslint:disable-next-line:chai-vague-errors
      expect(space.previous(loc)).to.be.null;
    });

    it("moves backwards over contextually irrelevant nodes", () => {
      const { doc: local, expectedPositions } = docs.irrelevant;
      expectPositions(local, "previous", expectedPositions.slice().reverse(),
                      node => (node as Element).tagName !== "ig");
    });

    it("when passed a node outside the space, raises an exception", () => {
      // tslint:disable-next-line:chai-vague-errors
      expect(() => DOMSpace.makeSpanningNode(doc)
             .previous(new DOMLoc(doc.createTextNode("foo"), 0)))
        .to.throw(DOMSpaceScopeError, "location is not within the space");
    });
  });

  function expectIterations(span: Document | { min: DOMLoc; max: DOMLoc },
                            reverse: boolean,
                            expectedPositions: [Node, number][],
                            relevanceTest?: (node: Node) => boolean): void {
    const space = span instanceof Document ?
      DOMSpace.makeSpanningNode(span, relevanceTest) :
      new DOMSpace(span.min, span.max, relevanceTest);

    let ix = 0;
    if (reverse) {
      for (const loc of space.reversed()) {
        expect(loc, `at ${ix}`)
          .to.deep.equal(new DOMLoc(...expectedPositions[ix]));
        ix++;
      }
    }
    else {
      for (const loc of space) {
        expect(loc, `at ${ix}`)
          .to.deep.equal(new DOMLoc(...expectedPositions[ix]));
        ix++;
      }
    }

    expect(ix).to.equal(expectedPositions.length);
  }

  describe("#[Symbol.iterator]()", () => {
    it("iterates", () => {
      const { doc: local, expectedPositions } = docs.allRelevant;
      expectIterations(local, false, expectedPositions);
    });

    it("iterates in reverse", () => {
      const { doc: local, expectedPositions } = docs.allRelevant;
      expectIterations(local, true, expectedPositions.slice().reverse());
    });
  });
});
