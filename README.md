# dom-movement

This library provides a simple means to move from position to position in a DOM
tree. It works with XML and HTML DOM trees.

## General Principles

### Relevance

The primary goal of this library is to model movements among the characters of a
document **that are visible to the end user.** What this means in practice
varies from use-case scenario to use-case scenario. For instance, in some cases,
element attributes may correspond to text visible to the user, and in many other
cases it won't.

This library's implementation aims to strike a balance between an extremely
general implementation that would allow movement suitable for all usage
scenarios, but which would increase code complexity and development time (and
probably run into YAGNI), and too specialized an implementation that ends up not
being useful except in a few specialized cases.

This library is able to move through:

 * text nodes,
 * elements,
 * documents,
 * document fragments.

The other types of DOM elements are deemed "irrelevant" and skipped.

You can add to the list of irrelevant nodes (by using the ``relevanceTest``
parameter of ``DOMSpace``'s constructor). For instance, you could decide that
all nodes that are invisible due to their CSS style are irrelevant, and they
would also be skipped. However, you cannot *remove* from the list shown
above. The library provides no sanctioned way, for instance, to deem attribute
notes relevant and move through them.

#### Intrinsic Node Relevance

Intrinsic relevance is determined by two tests that the node must pass:

+ An internal test performed by the ``DOMSpace`` implementation. This test
  only deems elements, text nodes, document nodes and document fragments as
  intrinsicly relevant.

+ If the internal test is successfull (i.e. the node was deemed intrinsically
  relevant), then the ``relevanceTest`` provided to the constructor, if
  provided, is used.

The internal test cannot be overruled by ``relevanceTest``. You could overrule
it by overriding it in a derived class but doing so is not supported. You would
have to override other methods of ``DOMSpace`` in order to prevent it from
crashing.

##### Notation

In the following examples, we will use the notation ``<tag_i>`` indicate that
the element ``tag`` is intrinsically irrelevant. The absence of ``_i`` means
that the element is contextually relevant. Note that the suffix merely indicates
irrelevance and is not actually part of the element name.

#### Contextual Node Relevance

A node is contextually relevant if the node and all its ancestor nodes within
the space are intrinsically relevant. Consider this tree:

```
<div_i>
 <p>Foo</p>
</div_i>
```

In this example the ``div`` element is intrinsically irrelevant. The element
``p`` is deemed *intrinsically relevant*. However, it would still would be
*contextually irrelevant* because its parent is intrinsically irerelevant.

#### Location Relevance

Similarly, locations are relevant or irrelevant. (There is no distinction
between intrinsic and contextual irrelevance for locations.) A relevant location
is a location into a contextually relevant node. An irrelevant location is a
location into a contextually irrelevant node. Note that a relevant location
**can point to an irrelevant node**.

Consider this tree:

```
<div>
 <p_i>Foo</p_i>
</div>
```

The location ``(p, 0)`` points to the text node inside the paragraph. Since the
paragraph is intrinsically irrelevant, the text node in it is contextually
irrelevant, and the location is irrelevant too.

The location ``(div, 1)`` points to the element ``p`` in ``div``. (The offset is
1, because at offset 0 there is a text node containing whitespace.) Although
this location *points to* an intrinsically irrelevant node, the location itself
is relevant because it is a location ``div``, which is contextually relevant.

### Reversibility

Suppose two locations ``A`` and ``B`` in a ``DOMSpace``. When iterating over the
positions from ``A`` to ``B``, you get intermediary positions ``P1``, ``P2``,
``P3``. If you iterate from ``B`` to ``A`` then the intermediary positions will
be ``P3``, ``P2``, ``P1``.
