export const FAMILY_COLORS: Record<string, string> = {
  // Early & Ancient (Browns, Grays, Teals)
  'Apostolic & Early Christianity': '#a8a29e', // Stone
  'Early Jewish Christianity': '#78716c',      // Dark Stone
  'Gnosticism & Esoteric Antiquity': '#9333ea', // Purple
  'Early Nontrinitarians & Adoptionists': '#c084fc', // Light Purple
  'Early Schisms & Strict Observance': '#0d9488', // Teal
  'Historical Dualism': '#be185d',             // Dark Pink

  // Catholic (Yellows & Golds)
  'Roman Catholicism (Latin Core)': '#eab308', // Yellow
  'Eastern & Regional Catholicism': '#facc15', // Light Yellow
  'Traditionalist Catholicism': '#ca8a04',     // Dark Yellow
  'Independent & Liberal Catholicism': '#fde047', // Pale Yellow

  // Orthodox (Oranges & Ambers)
  'Eastern & Oriental Orthodoxy': '#d97706',   // Amber
  'Old Calendar & Traditionalist Orthodox': '#b45309', // Dark Amber
  'Independent Sacramental & Autocephalous': '#f59e0b', // Light Amber

  // Magisterial Protestant (Blues & Indigos)
  'Pre-Reformation Dissenters': '#3b82f6',     // Blue
  'Confessional Lutheranism': '#4f46e5',       // Indigo
  'Confessional Reformed & Presbyterian': '#1d4ed8', // Dark Blue
  'Anglo-Catholic & High Church': '#6366f1',   // Light Indigo
  'Mainline & Historic Protestantism': '#60a5fa', // Sky Blue

  // Free Church & Evangelical (Greens & Emeralds)
  'Radical Reformation & Anabaptist': '#10b981', // Emerald
  'Conservative Baptist & Calvinist': '#059669', // Dark Emerald
  'Wesleyan & Holiness Movements': '#16a34a',    // Green
  'Independent Evangelicalism': '#4ade80',       // Light Green

  // Charismatic & Restorationist (Reds & Roses)
  'Pentecostal & Charismatic': '#ef4444',        // Red
  'Oneness Pentecostalism': '#dc2626',           // Dark Red
  'Restorationist (Stone-Campbell)': '#f43f5e',  // Rose
  'Sabbatarian & Adventist Movements': '#fb923c', // Orange

  // Progressive & Alternative (Pinks, Cyans, Fuschias)
  'Progressive Christianity & Universalism': '#22d3ee', // Cyan
  'Unitarian & Hebrew Roots': '#06b6d4',             // Dark Cyan
  'Modern Restorationist Movements': '#d946ef',      // Fuchsia
  'High-Church New Movements': '#ec4899',            // Pink
};

export const FAMILY_METADATA: Record<string, { century: string, region: string, members: string, desc: string }> = {
  'Apostolic & Early Christianity': { century: '1st Century', region: 'Middle East / Mediterranean', members: 'Historic', desc: 'The foundational communities reflecting the immediate post-resurrection period, encompassing early Petrine, Pauline, and Johannine traditions.' },
  'Early Jewish Christianity': { century: '1st-2nd Century', region: 'Middle East', members: 'Historic', desc: 'Early sects that sought to strictly maintain Jewish law and customs within the Jesus movement, often holding a lower Christology.' },
  'Gnosticism & Esoteric Antiquity': { century: '1st-4th Century', region: 'Mediterranean / Middle East', members: 'Historic', desc: 'Syncretic movements emphasizing secret spiritual knowledge (gnosis) for salvation, often characterized by rejection of material creation.' },
  'Early Nontrinitarians & Adoptionists': { century: '2nd-3rd Century', region: 'Mediterranean', members: 'Historic', desc: 'Early attempts to understand Christ by either claiming he was a human adopted by God or by rejecting the concept of the divine Logos.' },
  'Early Schisms & Strict Observance': { century: '2nd-5th Century', region: 'North Africa / Mediterranean', members: 'Historic', desc: 'Rigorist movements that broke from the main church over disciplinary issues, often refusing to forgive lapsed Christians.' },
  'Historical Dualism': { century: '2nd-12th Century', region: 'Middle East / Europe', members: 'Historic', desc: 'Radical sects that believed the physical universe was created by an evil deity, enforcing strict asceticism and rejecting the Old Testament.' },
  'Roman Catholicism (Latin Core)': { century: '1st Century', region: 'Rome / Global', members: '1.3 Billion', desc: 'The largest Christian tradition, defined by papal supremacy, Latin-rite liturgical tradition, and Catholic sacramental theology.' },
  'Eastern & Regional Catholicism': { century: '16th-19th Century', region: 'Eastern Europe / Middle East', members: '18 Million', desc: 'Autonomous churches in full communion with the Pope that maintain Eastern Orthodox or localized liturgical traditions.' },
  'Traditionalist Catholicism': { century: '12th-20th Century', region: 'Europe / Global', members: '< 5 Million', desc: 'Groups ranging from historic rigorist mystics to modern traditionalists who reject the reforms of Vatican II.' },
  'Eastern & Oriental Orthodoxy': { century: '1st Century', region: 'Middle East / Eastern Europe', members: '220 Million', desc: 'Historic, autocephalous churches maintaining ancient apostolic succession, mystical theology, and reliance on early ecumenical councils.' },
  'Old Calendar & Traditionalist Orthodox': { century: '4th-20th Century', region: 'Russia / Eastern Europe / Africa', members: '45 Million', desc: 'Orthodox communities characterized by strict adherence to ancient customs, unrevised calendars, or retention of Old Testament practices.' },
  'Independent Sacramental & Autocephalous': { century: '19th-20th Century', region: 'Europe / North America', members: '< 1 Million', desc: 'Churches possessing valid apostolic succession that sit structurally between Catholicism and Orthodoxy but are independent of papal authority.' },
  'Pre-Reformation Dissenters': { century: '12th-15th Century', region: 'Europe', members: '< 100,000', desc: 'The earliest sparks of the Reformation, proto-Protestant groups that rejected papal wealth and authority centuries before Martin Luther.' },
  'Confessional Lutheranism': { century: '16th Century', region: 'Germany / Scandinavia', members: '15 Million', desc: 'Strict adherents to the theology of Martin Luther and the Book of Concord, maintaining high sacramental views alongside justification by faith.' },
  'Confessional Reformed & Presbyterian': { century: '16th Century', region: 'Switzerland / Scotland', members: '30-40 Million', desc: 'The strict Calvinist wing of the Reformation, emphasizing the absolute sovereignty of God, covenant theology, and presbyterian governance.' },
  'Anglo-Catholic & High Church': { century: '16th-19th Century', region: 'England', members: '< 5 Million', desc: 'Protestants who resisted Calvinist purges during the Reformation, maintaining high liturgy, episcopal authority, and a sacramental via media.' },
  'Radical Reformation & Anabaptist': { century: '16th Century', region: 'Europe', members: '4 Million', desc: 'Movements emphasizing voluntary adult believer\'s baptism, non-violence, and complete separation of church and state.' },
  'Conservative Baptist & Calvinist': { century: '17th Century', region: 'England / North America', members: '40-50 Million', desc: 'Traditions emphasizing believer\'s baptism, congregational autonomy, and often Reformed (Calvinist) soteriology.' },
  'Wesleyan & Holiness Movements': { century: '18th-19th Century', region: 'England / North America', members: '80 Million', desc: 'Evangelical movements originating with John Wesley, defined by Arminian theology (free will) and personal sanctification.' },
  'Independent Evangelicalism': { century: '20th Century', region: 'North America / Global', members: '100-150 Million', desc: 'Modern, non-denominational movements focusing on personal conversion, biblical authority, and contemporary worship.' },
  'Pentecostal & Charismatic': { century: '20th Century', region: 'North America / Global', members: '600 Million', desc: 'Highly dynamic movements emphasizing the direct experience of God through the baptism in the Holy Spirit and supernatural gifts.' },
  'Oneness Pentecostalism': { century: '20th Century', region: 'North America', members: '30 Million', desc: 'A distinct movement within Pentecostalism that rejects orthodox Trinitarian theology in favor of a modalistic view of God.' },
  'Restorationist (Stone-Campbell)': { century: '19th Century', region: 'North America', members: '5-7 Million', desc: 'Movements seeking to restore primitive first-century Christianity, characterized by strict congregationalism and baptismal regeneration.' },
  'Sabbatarian & Adventist Movements': { century: '19th Century', region: 'North America', members: '25 Million', desc: 'Groups defined by an intense focus on the imminent second coming of Christ (eschatology) and the observance of the Saturday Sabbath.' },
  'Mainline & Historic Protestantism': { century: '16th-18th Century', region: 'Europe / North America', members: '70-90 Million', desc: 'Established, formally structured Protestant denominations that have historically embraced a moderate-to-liberal theological trajectory.' },
  'Progressive Christianity & Universalism': { century: '19th-21st Century', region: 'North America / Europe', members: '5-10 Million', desc: 'The theological left, prioritizing social justice, rationalism, deconstruction of historic dogma, and often affirming eventual universal salvation.' },
  'Unitarian & Hebrew Roots': { century: '16th-20th Century', region: 'Europe / North America', members: '< 3 Million', desc: 'Movements united by their rejection of historic Christian creeds in favor of returning to a Torah-observant or strictly monotheistic biblical reading.' },
  'Modern Restorationist Movements': { century: '19th-20th Century', region: 'North America / Global', members: '25-30 Million', desc: 'New Religious Movements using Christian vocabulary but operating with completely unique theology, exclusive prophets, or new scriptures.' },
  'High-Church New Movements': { century: '19th-20th Century', region: 'Europe / North America', members: '9 Million', desc: 'Rare groups that combine high-church liturgy and sacraments with brand new, ongoing apostolic or Marian revelation.' },
  'Independent & Liberal Catholicism': { century: '19th-20th Century', region: 'Europe / Philippines', members: '2-6 Million', desc: 'Groups maintaining Catholic liturgy and vestments but embracing progressive social views, esoteric theosophy, or independence from Rome.' }
};