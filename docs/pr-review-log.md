# Pull Request Review Log v 1.5

## Pull Request Number

- [PR # 1](https://github.com/cook-county-ocs/relias-mcp/pull/1)

# Description

Setting up the project and enforcing the 5% learning rule in Git. Setting up features and chores to be divvied up between CC and me.

# Learing

## What I learned

- Claude.md was stale at the parent level, as the 5% rule was not codified at this level.
- there are a lot of node packages here, and I wouldn't even know where to start with what they do and how to use them
  - TS is just different enough from JS that its adding layers to the learning difficulty.

## What I confirmed

- Specific tasks with clear instruction are easy for me to accomplish. can some of this be pulled into the learning system?
  - Definintely as a chore. I can do git and cli commands and undo them
  - I would reallly prefer to do the coding, but, that's a step too far when the need is a product.
- I knew how to make the SSH key, but the guidelines was helpful

## What to do differently

- I should have been able to write one line of code -- the fact that it's TS is scary but not a deal breaker

# Next steps

- See if I can read more of the code and maybe take on one task

------

# Pull Request Number
- 2 - 10

# Description
- 2: add dependabot
- 3: update a dependency from 4 to 6
- 4: update es/lint fron 9.34 to 10
- 9: adding code to pull the refresh token
  - Complicaiton discoverd: I had to have claude adjust the rules from 1 to 0, so i could approve the work.
- 7: bumping pino
- bumpting node
- This PR is about gettign all dependencies up to be LTS packages

# WhatI learned
- how to use github ui to review, comment,check and merge
  - all but merge was a new lesson, but even the mege was new due to the enhanced rules regarding merging

# what I'd do different
- one pr to bump all the versions of libraries. while the one at a time helped me learn, it was tedious.
- theres a p7 tag on things. I know we set Features, Chores, and tasks. I think Claude just added a P (phase?)

# next steps:
- determine P
- finish f1b 

# Pull Request Number
- [12](https://github.com/cook-county-ocs/relias-mcp/pull/12)

# Description
- building presistance with github and the difference engine
- lots of items I am not sure how I can test.

# what I learned:
- the tests did not test integration
- the things to review are things i wouldn't know how to review

# what I'd do differently
- I did push to get f3 done, which is good. but i think i may have missed out on some learning.

# next steps
- f4!

# [Pr 14](https://github.com/cook-county-ocs/relias-mcp/pull/14)

# Description
- Algorithim spec, in 2 parts
  - This is the math one where the analysis begins.
  - Normalizing
  - levenshtein
  - jaro-winkler
  - token-set-ratio
  - code-parsing/splitter

# what I learned
- alittle bit about the two main kinds of algorhims: what they are good for
  - Jaro is for 
    - capitols, order,
  - Levenshtein: transpotions

# what I'd do differently
- take a course on algorphyms. 
- is this something that already exists in libarires? it has to!

# next steps
- f4b.

# [PR-14](https://github.com/cook-county-ocs/relias-mcp/pull/15)

# Description
- Feature 4, pr-2b.
- WE divvied up the prs to chunk the work into related tasks

# what I learned
- the algo worked 
- - and e2e tests was the right call
- Regex + algo seems to be a way to make this work

# what I would do differently
- NLP has been a thing I've wanted to learn for so long. I could have done more here -- but the eco system is very far behind. I need to get this working asap.

# next step
- testing the CI 
- v 1.1