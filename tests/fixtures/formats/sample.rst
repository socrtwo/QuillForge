=============
Pandoc Sample
=============

:Author: Pat Writer

Introduction
============

This is *emphasized*, **strong**, [STRIKEOUT:struck], ``inline code``,
H\ :sub:`2`\ O and x\ :sup:`2` text with a
`link <https://example.com/docs>`__ and a footnote. [1]_

Lists
-----

-  Apple
-  Banana

   -  Nested banana

-  Cherry

1. First
2. Second

   a. Sub alpha

3. Third

..

   A block quote with **bold** inside.

.. code:: python

   def hello():
       return "world"

Table
-----

===== === ===========
Name  Qty Note
===== === ===========
Pens  12  blue
Paper 500 *A4* sheets
===== === ===========

Math inline :math:`E = mc^2` and display:

.. math:: \int_0^1 x^2\,dx = \frac{1}{3}

.. figure:: swatch.png
   :alt: Swatch image

   Swatch image

--------------

Final paragraph.

.. [1]
   The footnote text with *emphasis*.
