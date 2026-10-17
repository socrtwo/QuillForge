---
author: Pat Writer
lang: en-US
title: Pandoc Sample
---

# Introduction

This is *emphasized*, **strong**, ~~struck~~, `inline code`,
H<sub>2</sub>O and x<sup>2</sup> text with a
[link](https://example.com/docs "Docs") and a footnote.[^1]

## Lists

- Apple
- Banana
  - Nested banana
- Cherry

1.  First
2.  Second
    1.  Sub alpha
3.  Third

> A block quote with **bold** inside.

``` python
def hello():
    return "world"
```

## Table

| Name  | Qty |    Note     |
|:------|----:|:-----------:|
| Pens  |  12 |    blue     |
| Paper | 500 | *A4* sheets |

Math inline $E = mc^2$ and display:

$$\int_0^1 x^2\,dx = \frac{1}{3}$$

<figure>
<img src="swatch.png" alt="Swatch image" />
<figcaption aria-hidden="true">Swatch image</figcaption>
</figure>

------------------------------------------------------------------------

Final paragraph.

[^1]: The footnote text with *emphasis*.
