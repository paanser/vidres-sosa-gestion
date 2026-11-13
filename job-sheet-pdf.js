"use strict";
(() => {
  // Embedded from icons/icon-512.png so PDF generation needs no image request.
  const vsLogo =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAgAAAAIACAIAAAB7GkOtAAAqtUlEQVR4nO3deXhV1b3/8X1OcjIACQkkgBBmQggzCTMEEBBHQBnsrVqtV63WqvXnXK+9vWp7q9XaWrXV1tuf16oVBIGqzENCCGEMUwZDJgghQAgkZCDjybl/5D65FENycrLX2sN6v/7o80Bxf5fZ+P3sYe21HJFLZmkAAPU4jR4AAMAYBAAAKIoAAABFEQAAoCgCAAAURQAAgKIIAABQFAEAAIoiAABAUQQAACiKAAAARREAAKAoAgAAFEUAAICiCAAAUBQBAACKIgAAQFEEAAAoigAAAEURAACgKAIAABRFAACAoggAAFAUAQAAiiIAAEBRBAAAKIoAAABFEQAAoCgCAAAURQAAgKIIAABQFAEAAIoiAABAUQQAACiKAAAARREAAKAoAgAAFEUAAICiCAAAUBQBAACK8jd6AFZVsjrJ6CEA+D+9ls42egjW44hcMsvoMVgA7R6wHCKhXQTANdH0AdsgDFpFAPwTmj5ge4RBCwLgf9H6AaUQAxoBQN8HFKdyEqgbALR+AC3UjAEVA4DWD6BVqsWAWgFA6wfQLnViQJUAoPUD6BAVYsD+AUDrB+Aze8eAzdcCovsD6Ax79xDb3gFIOG32vjQALIT/3n1jzwAQ8bfBlqcfsCuagDdsGAA6nnj7nW9AQfSEa7FVAOh1mm12jgE0o0VcxT4BoMuptc15BXAt9IoWNgmATp5Re5xLAB1C37BDAHTmLNrgFALoDJUbiOUDwOeTZ/UzB0BHanYSa38IpuY5A6A7n3uCpb8Us/AdgG8/d1o/gDYo1Visegeg1EkCII1vXcKi9wGWvAPw4WdN6wfQISr0GevdAahwVgAYzoe+Ybn7AIsFAN0fgDS2zwArPQLq6E+W1g9AF3ZtPpa5A7DrCQBgfh3tJ1a5D7BMAHQI3R+AvmzZVawRAB2KU1ueJwCG61BvscRNgAUCgO4PwCRslgFmDwC6PwBTsVMGmD0AvEf3ByCHbbqNqQPA5OEJAO0ycx8zbwDw8AeAadnjQZB5A8B7dH8A8tmg85g0ALwPTBucAwAW5X3/MedNgEkDAAAgmhkDgMt/AFZh6ZsAMwaAl+j+AMzAur3IdAFgwpAEAF2Yrb+ZLgC8ZN3IBWA/Fu1I5goAL+PRoj9rADbmZV8y1U2AuQIAACCNiQKAy38Alma5mwATBQAAQCaLBQCX/wDMzFo9yiwBYJ57IgAQzSQdzywBAACQzBQBwOtfALZhoVfBpggAAIB8lgkALv8BWIVV+pVlAgAAoC/jA8AMD8IAQD7Du5/xAeANq9xPAUAzS3QtawQAAEB3BAAAKMrgADD8ERgAGMjYHmiBOwBLPEoDgKuYv3dZIAAAACIQAACgKAIAABRFAACAoowMAKYAAYCBndDsdwDmf40OANdi8g5m9gAAAAhCAACAoggAAFAUAQAAiiIAAEBRBAAAKIoAAABFEQAAoCgCAAAURQAAgKIIAABQFAEAAIoiAABAUQQAACiKAAAARREAAKAoAgAAFEUAAICiCAAAUBQBAACKIgAAQFEEAAAoigAAAEURAACgKAIAABRFAACAoggAAFAUAQAAiiIAAEBRBAAAKIoAAABFEQAAoCgCAAAURQAAgKIIAABQFAEAAIoiAABAUQQAACiKAAAARREAAKAoAgAAFEUAAICiCAAAUBQBAACKIgAAQFEEAAAoigAAAEURAACgKAIAABRFAACAoggAAFAUAQAAiiIAAEBRBAAAKIoAAABFEQAAoCgCAAAURQAAgKIIAABQFAEAAIoiAABAUQQAACiKAAAARREAAKAoAgAAFEUAAICiCAAAUBQBAACKIgAAQFEEAAAoigAAAEURAACgKAIAABRFAACAoggAAFAUAQAAiiIAAEBRBAAAKMrf6AEAaEevsB4x/QdFRfaO7N4jMiy8V1iPyLAeEaFhQQGBAS5XoMsV6AoIcLlcfv4N7ka3293gdjc2Nja4G2vq6iprqisvV1fWXK68XF15ubr0UlnJpbKSsovnL108X152ruxCbX2d0f9+MAwBAJiL0+GMHThk2sixowYNGx41cHjUoO5du3n5zwb4uzR/V3BHypVeKissOXvq/NlTJWcLS84UnD2de7qw+MJ5j8fjw+BhLQSADH5O56EPvujTI0J0obziU9Mev0d0Fcl+vPDOl3/4EwmF7nv9pQ37kiUUatWIAYPnTpgybeS4qbFjve/4nRfRPTyie3hcdOyVv1ldW5N7ujDn9MmcosKswvxjBTmnS0ukDQnSEAAyuJuaVidv+cni74suNLRv/7jo2LScLNGFZFo2e4GEKhcrLm09mCqh0FWGRw1cPP36RTOuj4kaJL/6tXQNCh43NGbc0JiW3ymrrEg/kXOsIDe9IOdQ7rd5xacMHB70QgBI8vmOTRICQNO0ZbMW2CkAhkcNHDM4WkKhL3dta3A3SijULMDlWpow/6Fblo0ePExa0c4IDwlNGBOfMCa++ZdllRUHczIPZGfsz844lJtVVXPZ2OHBNwSAJNmnCo7kZV95SSXI7TOu//eP3m10u0UXkmO5lMt/TdNWJG6UUyg8JPSHCxY/cMuSXmE95FQUITwkdH7c1PlxUzVNa/I0ZZ7IT8k4lJJxeE/mkfKqSqNHB28RAPKsSNwoIQAiuofPGTdpa9oe0YUkcDgcSxNukFCoOZ5FVwlwuR5d9L0nl/6gS2CQ6FoyOR3O0YOHjR487OHblreEwTtrPispv2j00NAOvgOQR9pDBjkPzSWYGjs2KrK3hEKf79gkusQtUxJ2/+FvL971kM26/1Waw+Dh25YPvq6f0WNB+7gDkKf5NePNkxNEF7p50oyuQcHVtTWiC4m2dJaMy//mV/Tijh/RPfydx342L26KuBKAb7gDkErClaamacGBQbdOnSWhkFAB/q5F0+ZIKJR05MDZi6WCDp4wJj7xrb/S/WFOBIBUWw+mXqy4JKHQ8lmWfwo0P35qWLcQCYUEvf51OBwvfP+BL37xpqVf9sLeCACpGtyNa1K2SSg0c0xc7/CeEgqJIyfDKmuqN+zbpfth/f383nvi355adq/TwX9iMC/+dsq2YoeM6YZ+TueSmfMkFBKke9duN8RPk1BoXcoO3RfDCXQFfPTcL5dJeYEBdAYBINvhvOzsohMSCll6LtCi6XMCXC4JhXR//hMUELji528smDhd38MCIhAABpBzEzBmcLSpVhfoEDnT/0+cLd6bdUzHAzocjnce/9n0UeN1PCYgDgFggFU7t7ibmiQUWj7HkjcB/SJ6TRs5TkKhlXpf/j/3vfsXT79e32MC4hAABjh7sXTn0QMSCi1JmO9wOCQU0tfShBskDNvj8axM2qzjAW+fMffp5ffpeEBANALAGHKeAkVF9JZzKa0vOa9PUzOPFJac0etofXpEvPHw03odDZCDADDG+n27KmuqJRSy3FyU0YOHjRgwWEIhfV//vvHw0zIX8Qd0QQAYo7a+bl3KDgmFFk6TNJ1GL8ukTP+vqav9KjVJr6MtmTnvRqb9wIIIAMPIWX+4e9duC+It05ucDucdUj5f+GbvTr2WsA90Bbxy/2O6HAqQjAAwzN6sYyfPFUsotHy2ZZ4CzRg94TrxG2dqmrYiUbdFme5dsJDFHmBRBICRVurXhtowL07SojqdJyerzlwsTT6apsuhAlyux26/S5dDAfIRAEZakbjJ4/GIrhLg77LE5PSggEA5i5h+kbSpyaPPdxh3zb1Fzi0LIAIBYKTCkjN7so5KKCTnzWon3TRpRkhwVwmFdLzxuveGRXodCpCPDWEMtmLHRglT9SePGD2g13U6TnsXQc6M1bScrONFJ3U5VEzUIAO3dL9cV5t1Mj+3uDCv+NSZC6Vny0ovVJRXVFdXXq6ua6hvdLsb3I0uP/+ggIDAgICggMAuAUGRYeG9wnr0Du/ZO7xn7x4R0f0GDO3bv2tQsFH/CjAcAWCwf6Qm/vrBnwYL3ibQ4XAsm3XDW6s+FlqlM8JDQq+fMFlCIR0nXy2T/na9vrFhT+bRzQd2p2YeyTyZ1+6CIvWNDfWNDdrl//3i5LurEDocjr49I6P7DRweNXBCdGxcdOzgPmzlqBACwGBVNZe/2Zss4eJ3qbkD4PYZc11+wv821jc2rN21Xa+jLZk5X69DtetUydm/rF+9MmmTvhsKeTye06Ulp0tLEo/sb/6d8G6hE6JHxEePnDkmLn74yAB/K31Ego4iAIy3InGjhACI7jdg/NCYw3nZogv5Rs72L5sP7C6rqtDlUEP79u/fq48uh2pbZU31Lz/58ydbvm5wN0ooV1ZVsf3Qvu2H9r2x8qMugUHTRo2bPXbirLHxIwcOlVAdkhEAxks+mlZ84XzfnpGiCy2bvcCcATCwd9+JMaMkFNJxCaapsWP1OlQbDuV+e/9vXiq+cF5Cre+6XFe7LW3vtrS9mqZFRfS+deqsW6YkTIkdwzZntsGJNF6Tp2n1zi0SCt0xY56f04xnfLmU178XKsq3Hdqr19GmxI7R61DXsvPowcU/f8Ko7n+VotJzH3z9xeKfPzH6gSVPv/9G4pH9ek2lhYHM2A4UJGdZiMiw8NnjJkoo1FFLpQTA6uStjW63XkebIvgOIOd04Q9/85Lu21V2Xumlsr9t+frOV56Z8KPlv/zkzzmnC40eEXxHAJjC8aKTh3K/lVDIhB8ExEXHDu3bX0IhHZ//dA0KFjpbxuPxPPHur/VarUiQMxdL/7Dm0xlP/OCmF3780aZ1Jh8tWkUAmIWcm4BbpiR0ETzltKPkZFLWyfxjBTl6HW2Q4LmSmw7sPng8U2gJHaXlZD7357fGPrT0Zx++zQ2BtRAAZrEmeVt9Y4PoKl0Cg26ZImO5BS/5OZ23z5CxTIW++Tqw93U6Hu27Ptq0VujxRaiqufxfG76c8cQPlr381Mb9KXI2PUUnEQBmUVZVseVAqoRCplocdM74SRHdw0VXcTc1rdL1Nfug3n11PNpVLtfV7jp2SNzxRdt59OC9r714IDvD6IGgfQSAich5CjRr7ETzLF8s5/nPjsP7Ssov6nhAoV8AfFuYL+FeENAIAFPZlrb3QkW56Cp+TueSBHmfsLahS2DQzZNnSiik+w7MoV0E7v6Yf+a0uIMDVyIATKTB3bg6eauEQibZKPjWqbMkvJG+VF21cX+KvscUOmym00AaAsBcdL9WbdXYIcOHRw2UUKhty2fLeP6zNmV7XUO9vsfsEiQwAFz+fJ8PSQgAczlWkPNtYYGEQoZ/EBAZFp4wJl5CIRHbrgldvbV3eE9xBweuRACYzudSXgUvTZjvcDgkFLqWJTPnS1iXIv9M0f7sdN0PK3SNTDlrzAEaAWBCq5I2S5hD3b9XnykjhK9m0wY57yEE7bosdJZOTNSggSKnmQItCADTKSm/mHh4v4RCy6Q8gm/VsL4Dxg2NEV3F4/GsTBISAKKX6Ll9xlyhxweaEQBmJOeDgEXT5hi13cfyOTKyJyXjcNH5cyKOXFNXK+KwLX6y+F8iw4R/HwcQAGa0Yd+uS9VVoquEdQuZHz9VdJVWLZXyIYK4KVWVl8XO1AzrFvKbh54y9iUNVEAAmFFdQ/263TskFJKzD9dVpsSOGdBL7Fo6mqZdrqv9ek+SoINLWKP/1qmzfv/o8+bcvwG2wV8vk5LzQcAN8dO6dxX4UWurliXIeP37dWpSdW2NoIOfLhXyZOkq359780fP/6pHaHcJtaAmAsCk9men558pEl0lwOVaPF3GYpwtXH7+i6RUFPoe5dT5s+IOfqUbJ07f/fbfHrp1aYCLzdmhPwLAvL5I2iyhiuS5QPPip4aHhIqucrq0JCX9sLjjHy86Ke7gV+kR2v1X//pE2vsrn15+n4SNo6EUAsC8ViRu9Hg8oqtMGTEmKrK36Cot5Gz/+0XSZqE71hadP1d6qUzc8b+rV1iP5//lX9M+WLnqF2/de8NC86znCksjAMyr6Py53ZlHRFdxOBzS1oYL7dJ1wcTpEgoJ+v7rSnK28LyK0+GcNTb+zUeeOfbhl1vf+MtL9/zo+vGTuwYFyx8J7IFlp0xtxY6NM0aNF11l2awFv1/9iegqmqYtnDYn0BUgusrB45m5xcI3JjyQnXFD/DTRVa7F4XCMHTJ87JDhT9xxt7upKetk/sGczEM5WYfzso8XnWh0u40aGKyFADC1r1ITX3voSdFrJg+PGjh2yPCj+ceFVtE0bamUWw05iyltPpj6s7selFCoXX5O5+jBw0YPHnbfgkWaptU11GecyD2Sd/xIXvaR/OPZpwrIA1wLAWBq1bU13+zZKWHZ5GWzbhAdAH17Rk4fNU5oCU3T6hsa1qVsF11F07SME7mFJWckfNDQUYGugLjokXHRI5t/WddQn3Ei72h+cx5kZxeeaHA3GjtCmAcBYHaf79goIQCWJMx/+eM/CV2EbknCfKdD+DunjftTyqsqRVdptn5v8iML75RTy2eBroC46Ni46NjmX9Y3NGSczDual30wJ+tAdkbemVMSJhrAtAgAs0tJP3S6tKRfRC+hVXqF9UgYE594ROAidHK+OpazjFKzT7etN38AXCXA5ZowbMSEYSPuu3GxpmnlVZUHj2ceOJ6xN+vovm/T2YtYNQSA2TV5mr5I2vzk0ntEF1o+e4G4AIgdOCR24BBBB29xvrxsx+F9oqu0yD5VkHwsLWFMnLSKugvrFjIvbsq8uCmaptXU1aZmHk06sj/x6IGsk/lGDw0yEAAWsCJxo4QAuGVKQnBgkKB1Lu+U8rnZquQtkl94/mX9aksHwJWCA4PmTpg8d8JkTdOKL5z/Zs/Or/ck7c06JvSLChiL7wAsIK/4VFpOpugqXYOCb5k8U8SRHQ7HHTNlLP8pYfr/VTbtTzmcly25qAR9e0Y+dOvSda/+4diHX77xo6fih480ekQQggCwhs+lrA23fPaNIg47Y9R4CWsYZJzIzTiRK7rKVTwezy8+ek9yUZkiw8Lvu3Hxhl//Kfn3Hz1823IJy3hAJgLAGtambK9vEP6Cbva4iRHd9d+HRM5yQyukX/43S8088s2enYaUlimm/+BX73/s2Idf/u7R54b27W/0cKAPAsAayqsqNx1IEV3Fz+lcMnOevscMdAXcNnW2vsf8rka3e3XyFtFVruW5v7wleWkgowT4u+6ed2vKHz7+8OmXxw4ZbvRw0FkEgGXIucLV/Wr9xknTQ7t01feY37X90N7z5Ya14PPlZT9973WjqsvndDgXTZ+z5Td//tOTP2eBUksjACxDTo8bPzRmWN8BOh5wmaTp/8Y8/2mx5WDqH9d9buwYJHM4HEsT5qe+88mz37s/KCDQ6OHAFwSAZUh7yrFstm4r9oR3C22eViiUnOdj7Xr5b++vlbIKhakEBwY9e+cPt735IU+ErIgAsBJJT4H0W7Jt0YzrA/yFb2Ul5w15uzwez2Pv/GdKxmGjB2KA6H4DNrz2pyeX3iNhtQ/oiLNlJXJmOg7odd3kEWN0OZSc7V/kzJH1Rn1Dw12/en5r2h6jB2IAl5//i3c99NHzvwwWvHgtdEQAWIycb510adz9e/WZFDO688dpW25xoYSv5LxXU1d772svyv8kzSRumjRj3at/iAzTfzIxRCAALEbOage6PLpZPmuBw+HQZTxtMGGrbXS7H3/316/87X01F+IfPzTm61+9RwZYAgFgMXLWOwvvFjo3bkonDyJh+5fmlfJEV/GBx+N5d+3fF/388aLSc0aPxQCD+/Rb8dKbIcHCp/+ikwgA65Gz4nEnl28bPzQmup+e00lb1bxWtugqPjuQnTH36Qc+275ewTX3Rw8e9vHP/tPfz8/ogaAtBID1yNnzZEF8pz7gkrT7o2le/15LeVXlk++9vvClx78tLDB6LLLNGDX+2e/db/Qo0BYCwHrk7HoY4HItmn69b/+sn9N5h95LSnxX836ZoqvoYt+3x+Y+88CzH/y2+MJ5o8ci1U+X3D1j1HijR4FrIgAsSc6+5z5/EDBr7MReYT30Hcx3fZWaeFnM7gUiNLrd/735H5N/8v0X/+vtsxdLjR6OJE6H853HXwx0BRg9ELSOALCkg8cz84pPia4ybeQ437aiXK7ft8RtWGH65z/fVd/Q8OH6Lyf++F8efftXaTlZRg9HhqjI3g/fttzoUaB1BIBVSXgV7HA4liZ0uJUHBwbdPDlBxHiuVHT+3O7MI6KrCFLf2LBq5+abXnjkphce+XzHhsqaaqNHJNZPl94tYplxdB4BYFVfJG2WsFefD9fyt05J6BoULGIwV1qRuNEGU2vScrKeePe1kfff/uBvf7FhX7IZFrQQISS4648X3mn0KNAKAsCqTpeWpKQfFl0lpv/g0YOHdegfkbP8pwm///JZXUP9P3Yn3vf6S7H3L37gzV/8ffuGc2UXjB6Uzu6ZfxtvAkyITeEtbEXiRgk7ki+btSC9wNsFiCK6h88aGy90PJqm7c9OLzh7WnQV+Sprqr9KTfwqNdHhcIwdMnzW2PipsWMnxYwO6xZi9NA6KzwkdGnC/M+2rzd6IPgn3AFY2NepSdW1NaKrLJk5z/slHu+YOVfCtz9WfP3bIR6P50he9jtrPrv7P1+I+eHC2U/d/9yf31q1c8uJs8VGD813d8+/1egh4GrcAVjY5brar/ckfW/OTUKr9OkRMXPMhJ1HD3rzhyU8/6lrqF+3e4foKubh8XiyTuZnncz/aNM6TdN6hoZNHD4yfvio+OEjJwwb0S24i9ED9Fb88JER3cMV2TvTKggAa1uxY6PoANA0bfnsBd4EwNC+/ScMGyF6MBv27bpUXSW6imldqCjfdGD3pgO7NU1zOpwjBgxuyYPofgMkrL7nM6fDuSB+Gk+BTIUAsLaUjMNF589FRfYWWuXWKbOe/eCt2vq6tv+YjjvJtEHOUkiW0ORpyjyZl3ky7+MtX2ma1r1rt7jokROHj5w6cmz88FFdzLcu/4KJ0wkAUyEArM3j8axM2vTUsnuFVukW3OWWyTO/3LWt7T/mw0cDHVVSfjHx8H7RVSzqUnXVjsP7mheL9ffzGzskZs64iQlj4yePGO3yM8V/6RNjRhk9BPwTXgJbnpwJkcvaWxx0YsyoQX36ih7GqqTN7ibhXz/YQKPbnZaT+daqj+/495/G/nDRw797Zc2ubTVGr5zRK6zHdT0ijB0DrkQAWF7+maL92emiq8wZN6lnaFgbf2C5lOn/K5LsM/1fmorL1Wt2bXv4d6/E3r/40bd/tTfrmIGDGSf+LRG8RwDYgYRpkf5+fnfMnHut/9fl57/Y16VDvXc0/3jWyXzRVWzscl3tqp2bF7702PVPP/CP3YkSviT/rpEDhsgvimshAOxg3e4ddQ31oqu0McVz7oTJPUK7ix6Anb7+NVbGidwHf/uLG59/RP52yv0ixE5YQIcQAHZwqbpq4/4U0VXiomOHXBfV6v/V7huCzmtwN65O3iq6ilKO5GXf9m+PvbPmM5lFfVtfFoIQADYh5+PYVht9t+AuN06cLrr0trS9FyrKRVdRTaPb/eonH7z88fvSKvaLiJRWC+0iAGxix+F9JeUXRVdZ1tpEz4XTZgcFBIouzfR/cd5b9/dPt30jp1bbUwkgGQFgE+6mplU7t4iuMqhP3+9O5Zbw/VdZVcWWA6miq6js5///XTlLkEq4VoD3CAD7kHONfNV0zz49ImaMniC66JrkbfWN9lwr3ySqai7LeRkQbL7vk1VGANhH1sn8YwU5oqvcPmPulZ+VLkmY7/1aoT7j+Y8EK5M2SUhZP6fTJJ8lQyMAbEbCq+DwkNB5cVNafrlc/POf40UnD+V+K7oKyqsq92dnSCjkdNJ2zIIzYSurk7c2uBtFV2n5ICCm/+BRgzq2X5gPuPyX5uBx4QHQ5GmS8M0KvEQA2MqFivLth/aJrnLjpOkhwV01TbtT/PT/Jk/TqqTNoqugmYQNZ2rr6f4mQgDYjYSnQIGugIXTZjscjjsS5omulXw07czFUtFV0KysqkJ0idq6dhYVh0y8jbGbzQd2l1VVhHcLFVpl2ewFJ84VR4n/rJ/nPzLVNwh/CXy53uAVSXEl7gDspr6xYe2u7aKrTB817vHb7xJdparm8jd7k0VX8c2Ldz30rzffEeDvMnogegoRv8Fkdc1l0SXgPQLAhiRcNTsdzivnAgnyj9REw5ewv5breka89uCTe9779Ac33Obv52f0cPTRp6fwdRqKL5wXXQLeIwBsKC0nK+d0odGj0IGcBY46Iyqi928feTb1nU/unHOjn/VnN44aOFR0iVPnz4kuAe9Z/q8sWmX+1tmuwpIze7KOGj0Krwzs3ffdx19Mfvu/75l/W4DLqg+FnA7nnHGTRFc5VXJWdAl4jwCwp1U7Nxuy3YeOViRu8ng8Ro+iA4b1HfDWj5899P4XTy27NzxE7Et4EeaMnxgZFi66StF5AsBECAB7Kr5wPvlomtGj6BSLbv8SGRb+wvcfOPzBF68/9P8kbJKsoyeX/kBClRPnhH9qAO8RALZl6QmUe7KOnrRypwgODLr/ptv3vPvpZ//2+i1TEsz/lvj7c2+eGjtWdJUGd2N6Qa7oKvAe3wHY1jd7k6tqLncTP7FPBIte/l/F6XDOj5s6P27q+fKyz3ds+HTbN/lnioweVCvGDY157cEnJRRKL8hlHQhT4Q7Atmrqar9KTTJ6FL6ora9bl7LD6FHoKTIs/PE77trz7qdrX3n7rrm3iP5Mr0PGD435/KXfyFml+eBx2VsQo20EgJ1Z9CnQ+n27KmuqjR6FENNHjf/9T57P+OvaL/79t/fesDCiu/CXrm373pyb1r76B2m7dB3ITpdTCF7iEZCdpWYeKSw5M6DXdUYPpGNsMIe1bf5+frPHTZw9buLrP3pqT9bRTftTdh49mFWYL3PW09C+/f/jvkclbObcwuPx7M48Iq0cvEEA2JnH41mZtPmZ5fcZPZAOOHuxdOfRA0aPQhI/p3PGqPEzRo3XNO1CRXlK+uHk9LTkoweFvioYPzTmR7ctu33GPMmvpvd9m36Wdf1MhgCwuZWJG60VAKt2bnE3WfsLBt/0DA1bNH3OoulzNE0rvVSWfiI3vSA3vSAn/URuXvGpTv5MAvxdcdGxs8dNXDT9+uh+A/QZcQet2y18iSp0FAFgcyfOFu/NOjYldozRA/HWClvM/+mkiO7hc8ZNavkut7a+ruDM6aLSc8WlJUWlJadLS4ovlFRcrqqpq6upq62pq7tcV1vf2ODv9HP5+wcHBoV3Cw0LCenbMzIqss/Q6/qPHjxs5MAhga4AA/+NmjxNX+/ZaeAA0CoCwP5WJG60SgAczsvOPlVg9ChMJyggMHbgkNiBQ4weiO92Zxzh+Y8JMQvI/tal7Kitt8YuHLZ//ausP/1jhdFDQCsIAPurrKnesG+X0aNoX4O7cU3KNqNHAf1lnszbcjDV6FGgFQSAEizxQcDWg6kXKy4ZPQro7501nxk9BLSOAFBC0pED58ouGD2Kdny+g9e/NpRXfGptCvN/TIoAUIK7qWnVzs1Gj6ItFysubeUpgR09+8Fv1ZzXawkEgCpMfn395a5tDe5Go0cBnf19+4Zd6YeMHgWuiQBQRfapgiN52UaP4pos8ZYCHXKhovw/Pv6j0aNAWwgAhZi2yZo8nOCDJk/T4+/8uqyywuiBoC0EgEJM+5jF5I+n4INXPn5/a9oeo0eBdhAACjHni1Z3U9Pq5C1GjwJ6WpG48Y98+WUFBIBaTHitnXTkAIsE2Mm2tL1P/+lNo0cBrxAAatl6MNVsj2VXmvXNBHywNmX7va+9WN/YYPRA4BUCQC0N7sYvd201ehT/p7Kmer0VlqmANz7e8tUjv3vVnO+Z0CoCQDmmWnDNQgvVoQ0N7saXP37/mfffbPLwzZeVEADKOZyXnV10wuhR/C/Tzkxt18b9KUxdbZZ/pujWnz363rq/Gz0QdBgBoCKT3AQ0b1Zj9Ch89M2enTc896Opj939m8//mnO60OjhGMPj8Xy2ff28Zx48TBZaEwGgIpNsu2iD17/5Z4re/OK/Zzzxg7nPPPDOms/yik8ZPSJ59mQdvemFR5587/Xq2hqjxwIfsSOYipo3Xr9+/GQDx9C8Yb2BA9BXekFuekHuq598MKzvgAWTpt84cfrkEWP8nPa8wMo/U/TqJx98wxaP1kcAKGrFjo3GBkBq5pHCkjMGDkCQ3OLC3HWFf1z3eXi30HlxU+fFTUkYE9crrIfR49JH8rG0D9d/uWl/Ci977YEAUNT6fbsqa6pDgrsaNQDrvv71UllVxaqdm5tX4R4eNXDmmLiE0XHTR40PDwk1emgdVl5VuTZl+3+t/9I80wegCwJAUbX1detSdtwz/zZDqtfU1X6VmmRIaUMcLzp5vOjkXzescTgcIwcOnRgzKm5YbFz0iOiogU6HeR8Tnb1YunF/yjd7d6akH2p0u40eDvTniFwyy6jaJavbbwG9ls6WMBLAEF2DgscPjZkQHTt6cPSI/oOG9R0Q4HIZO6QLFeX7szP2Z6enpB86lPutx+Mxdjw2YOZGxx0AYJjq2pqUjMMpGYebf+nndA7q02941KAR/QdFRw3oH3ldv8hefcIj/P38BA2g0e0+df5sXvGpvOJTxwpyDmRn5J8pElQLJkQAAGbhbmpq7sUb9iW3/Kaf09mnR0S/iN5REb0iw3qEh4SGdwsN6xbSI6R7WLeQ0K7dAvxdAf4ul79/gMvl8vf3d/q5m5rqGxvqGxpa/re6tuZixaXSivLSS2UXKsovVJSfvXih4Mzpk+eKWblBZQQAYGrupqbTpSWnS0v2GT0S2I95X0ABAIQiAABAUQQAACiKAAAARREAAKAoAgAAFEUAAICiCAAAUBQBAACKIgAAQFEEAAAoigAAAEURAACgKAIAABRFAACAoggAAFAUAQAAiiIAAEBRBAAAKIoAAABFEQAAoCgCAAAURQAAgKIIAABQFAEAAIoiAABAUQQAACiKAAAARREAAKAoAgAAFEUAAICiCAAAUBQBAACKIgAAQFEEAAAoigAAAEURAACgKAIAABRFAACAoggAAFAUAQAAiiIAAEBRBAAAKIoAAABFEQAAoCgCAAAURQAAgKIIAABQFAEAAIoiAABAUQQAACiKAAAARREAAKAof6MHgH9yOKfM6CEAAo2PDjd6CPg/3AEAgKIIAABQFAEAAIoiAABAUQQAACiKAAAARREAAKAoAgAAFEUAAICiCAAAUBQBAACKIgAAQFEEAAAoigAAAEURAACgKAIAABRFAACAoggAAFAUAQAAiiIAAEBRBAAAKIoAAABFEQAAoCgCAAAU5W/0APBPxkeHGz0EAKrgDgAAFEUAAICiCAAAUBQBAACKIgAAQFFmD4CS1UlGDwEAfGTyDmZkAPRaOtvA6gBgBgZ2QrPfAQAABCEAAEBRBAAAKIoAAABFWSAATP4aHQBaZf7eZXAAMBEIgMqM7YEWuAMAAIhAAACAoqwRAOZ/lAYAV7JE1zI+AHgNAEBNhnc/4wMAAGAIywSAJe6nAECzTr+yTAAAAPRligDw8kGYVUIVgMq87FSGvwDQTBIAAAD5zBIAZghDAJDDJB3PLAHgJZ4CATAza/UoiwUAAEAvJgoAXgUDsDQLvf5tZqIAAADIZK4A4CYAgEVZ7vJfM1sAeI8MAGAeFu1IpgsAU8UjAOjIbP3NdAHgPYtGLgCbsW4vMmMAeB+S1v25A7AH77uQ2S7/NXMGAABAApMGADcBAMzP0pf/mmkDoEPIAADy2aDzmDcAOhSYNjgTACykQz3HnJf/mpkDQDPxTw0AvGTmPmbqAOgQbgIAyGGbbmP2AOBBEABTscfDn2ZmDwCNDABgGnbq/polAkAjAwCYgM26v2aVAOgoMgCAvmzZVSwTAB2NU1ueLQCG6Gg/scTlv6Zpjsgls4weQwf40NatciYAmJC9e45l7gCa+fCT5VYAgG/s3f01ywWARgYAkML23V+z3COgFr71dMudHgDyqdNerHcH0My3nzW3AgDapk7316x7B9DM54Zu0bMFQBwF+4lV7wCa+fxz51YAwJUU7P6a1e8AmnWmm1v65AHoPJUbiB0CQOv0Fb3VzyIAH9A3bBIAmk5PdWxwRgG0jV7Rwj4BoOn3ZN8epxbAVWgRV7FVADTT8QWvbU4zoDJ6wrXYMAA0MZN8bHbiAXujCXjDngGgSZnoab+/DYBF8d+7b2wbAM2Y7w+gk2zZ+ptZ+0Owdtn4zAGQwN49xOZ3AC24FQDQIfZu/c1UCYBmxACAdqnQ+pupFQDNiAEArVKn9TdTMQCaEQMAWqjW+pupGwDNiAFAcWq2/maqB0ALkgBQisp9vwUB8E+IAcD2aP0tCIBrIgwA26Dpt4oA8AphAFgOTb9dBICPiATAVGj3PiAAAEBRNl8LCABwLQQAACiKAAAARREAAKAoAgAAFEUAAICiCAAAUBQBAACKIgAAQFEEAAAoigAAAEURAACgKAIAABRFAACAoggAAFAUAQAAiiIAAEBRBAAAKIoAAABFEQAAoCgCAAAURQAAgKIIAABQFAEAAIoiAABAUQQAACiKAAAARREAAKAoAgAAFEUAAICiCAAAUBQBAACKIgAAQFEEAAAoigAAAEURAACgKAIAABRFAACAoggAAFDU/wCNd3bk2kERxAAAAABJRU5ErkJggg==";
  // Vector lines stay visible even when printing without background graphics.
  function build(job, client = {}, company = {}) {
    const doc = new jspdf.jsPDF({ unit: "mm", format: "a4", compress: true });
    const left = 15,
      width = 180,
      bottom = 280;
    let y;
    const text = (value) => String(value || "").replace(/\t/g, " ");
    function header(continued = false) {
      doc.setTextColor(30);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text(
        doc.splitTextToSize(text(company.name || "Vidres Sosa"), width)[0],
        left,
        18,
      );
      doc.setFontSize(11);
      doc.text(
        "HOJA DE VISITA" + (continued ? " · Continuación" : " · Operarios"),
        left,
        26,
      );
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      const lines = doc.splitTextToSize("Expediente: " + text(job.id), width);
      doc.text(lines, left, 33);
      y = 36 + lines.length * 4.5;
      doc.setDrawColor(100);
      doc.setLineWidth(0.25);
      doc.line(left, y, left + width, y);
      y += 7;
    }
    function next() {
      doc.addPage();
      header(true);
    }
    function field(label, value) {
      doc.setFontSize(10);
      const lines = doc.splitTextToSize(
        label + ": " + (text(value) || "—"),
        width,
      );
      for (const line of lines) {
        if (y > bottom - 5) next();
        doc.text(line, left, y);
        y += 4.7;
      }
      y += 2;
    }
    doc.setProperties({ title: "Hoja de visita · " + text(job.id) });
    header();
    field("Cliente", job.cliente);
    field("Teléfono", job.telefono || client.telefono);
    field("Dirección", job.direccion || client.direccion);
    field("Población", job.poblacion || client.poblacion);
    const planned = /^\d{4}-\d{2}-\d{2}$/.test(job.fecha || "")
      ? job.fecha.split("-").reverse().join("/")
      : job.fecha;
    field("Cita prevista", [planned, job.hora].filter(Boolean).join(" · "));
    field("Responsable", job.responsable);
    field("Trabajo", job.descripcion);
    field("Notas del expediente", job.notas);
    // Keep at least 12 cm of uninterrupted grid for measurements and sketches.
    if (bottom - y < 142) next();
    y += 2;
    doc.text(
      "Fecha visita: ____ / ____ / ______    Operario: __________________________",
      left,
      y,
    );
    y += 8;
    doc.setFont("helvetica", "bold");
    doc.text("MEDIDAS, CROQUIS Y ANOTACIONES", left, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    y += 5;
    doc.text(
      "Cuadrícula de 5 mm · Indicar las unidades de las medidas",
      left,
      y,
    );
    y += 3;
    const height = Math.floor((bottom - y) / 5) * 5;
    // Print the existing VS logo beneath the grid, with low ink coverage.
    const logoSize = Math.min(100, height - 10);
    doc.saveGraphicsState();
    doc.setGState(new doc.GState({ opacity: 0.06 }));
    doc.addImage(
      vsLogo,
      "PNG",
      left + (width - logoSize) / 2,
      y + (height - logoSize) / 2,
      logoSize,
      logoSize,
    );
    doc.restoreGraphicsState();
    doc.setDrawColor(190);
    doc.setLineWidth(0.1);
    for (let x = left; x <= left + width; x += 5) doc.line(x, y, x, y + height);
    for (let row = 0; row <= height; row += 5)
      doc.line(left, y + row, left + width, y + row);
    doc.setDrawColor(100);
    doc.setLineWidth(0.25);
    doc.rect(left, y, width, height);
    const pages = doc.getNumberOfPages();
    for (let page = 1; page <= pages; page++) {
      doc.setPage(page);
      doc.setFontSize(8);
      doc.setTextColor(90);
      doc.text("Hoja de visita · " + page + " / " + pages, left, 289);
    }
    return doc;
  }
  if (typeof module !== "undefined" && module.exports)
    module.exports = { build };
  else window.VSJobSheetPDF = { build };
})();
