
let store = {
    nodes: [],
    edges: [],
    clusters: {},
    clusterSizes: {}
};

const margin = {top: 10, right: 30, bottom: 30, left: 40},
width = 1000 - margin.left - margin.right,
height = 1000 - margin.top - margin.bottom;

let simulation;
var link;
var node;
var label;
var cluster;
var linkForce;
var linkCharge;
var chargeForce;
var centerForce;
var clusteringForce;

let g = d3.select("svg")
    .attr("width", "100%")
    .attr("height", height + margin.top + margin.bottom)
    .append("g")
    .attr("transform",
        `translate(${margin.left}, ${margin.top})`);

let linkG = g.append('g').attr('id', 'links')
let nodeG = g.append('g').attr('id', 'nodes')
let labelG = g.append('g').attr('id', 'labels')

console.log('loading data from', DATAFILE);

d3.json(DATAFILE).then((data)=> {
    store.raw = data;
    store.raw.forEach(item => {
        store.nodes.push({
            id: item.fullName,
            link: item.link,
            is_jewish: item.jewish === 'y',
            is_vt: item.vtmember === 1,
            importance: item.importance,
            is_male: item.gender === 'm',
            is_female: item.gender === 'f',
            is_non_gendered: item.gender !== 'f' && item.gender !== 'm',
        })
        item.imports.forEach(edgeItem => {
            let d = {
                source: item.fullName,
                target: edgeItem[0],
                edgeType: edgeItem[2],
            }
            store.edges.push(d);
        })
    });
    console.log('data loaded...');
}).then(()=> {
    store.nodes = store.nodes.filter(node => node.importance > 4)

    store.edges.forEach((e, ix) => {
        if (store.nodes.find(n=>n.id === e.source)) {
            store.edges[ix].source = store.nodes.find(n=>n.id === e.source);
        } else {
            store.edges[ix].errorNode = true;
            // throw "error!"
        }
        if (store.nodes.find(n=>n.id === e.target)) {
            store.edges[ix].target = store.nodes.find(n=>n.id === e.target);
        } else {
            store.edges[ix].errorNode = true;
            // throw "error!"
        }
        importance1 = store.edges[ix].source.importance ? store.edges[ix].source.importance : 0.25;
        importance2 = store.edges[ix].target.importance ? store.edges[ix].target.importance : 0.25;
        store.edges[ix].weight = importance1 + importance2;
    });
    store.edges = store.edges.filter(e=>!e.errorNode) // remove any erroneous edges
    console.log('edges processed...');
}).then(()=> {
    let community = jLouvain()
        .nodes(store.nodes.map(n=>n.id))
        .edges(store.edges.map(edge => {return {
            source: edge.source.id,
            target: edge.target.id,
            weight: edge.weight
        }}))
    let result = community();
    // console.log(result)

    const defaultRadius = 25;
    store.nodes.forEach(function (node) {
        node.r = defaultRadius;
        node.cluster = result[node.id]
    });

    // collect clusters from nodes
    store.nodes.forEach((node) => {
        const radius = node.r;
        const clusterID = node.cluster;
        if (!store.clusters[clusterID] || (radius > store.clusters[clusterID].r)) {
            store.clusters[clusterID] = node;
        }
    });
    // console.log('clusters', store.clusters);
}).then(()=> {
    link = linkG.selectAll(".link")
        .data(store.edges)
        .join("line")
        .attr("class", edge => edge.edgeType)
        .style("stroke-width", function(d) { return Math.sqrt(d.weight); });

    nodeScale = d3.scalePow()
        .domain(d3.extent(store.nodes.map(n=>n.importance)))
        .range([5,10])

    node = nodeG.selectAll(".node")
        .data(store.nodes)
        .join('circle')
        .attr("class", "node")
        .attr("data-cluster", n => n.cluster)
        .attr("r", n => nodeScale(n.importance));

    label = labelG.selectAll('text')
        .data(store.nodes)
        .join('text')
        .html(n => `${n.id}`)

    cluster = g.selectAll('text.cluster')
        .data(Object.keys(store.clusters))
        .join('text')
        .attr('class', 'cluster')
        .attr('data-cluster', c=>c)
        .html(c => `Cluster ${c}`)

    console.log('elements drawn done...')
}).then(()=>{
    // These are implementations of the custom forces
    function clustering(alpha) {
        store.nodes.forEach((d) => {
            const cluster = store.clusters[d.cluster];
            if (cluster === d) return;
            let x = d.x - cluster.x;
            let y = d.y - cluster.y;
            let l = Math.sqrt((x * x) + (y * y));
            const r = d.r + cluster.r;
            if (l !== r) {
                l = ((l - r) / l) * alpha;
                d.x -= x *= l;
                d.y -= y *= l;
                cluster.x += x;
                cluster.y += y;
            }
        });

        Object.keys(store.clusters).forEach(cluster => {
            xValues = d3.extent(store.nodes.filter(n=>n.cluster === +cluster).map(n=>n.x));
            xValues[0] = xValues[0] - 5;
            xValues[1] = xValues[1] + 5;
            yValues = d3.extent(store.nodes.filter(n=>n.cluster === +cluster).map(n=>n.y));
            yValues[0] = yValues[0] - 5;
            yValues[1] = yValues[1] + 5;
            // console.log(cluster, xValues, yValues)
            count = store.nodes.filter(node=>node.cluster === +cluster).length
            store.clusterSizes[cluster] = {
                maxX: xValues[1],
                maxY: yValues[1],
                minX: xValues[0],
                minY: yValues[0],
                width: xValues[1] - xValues[0],
                height: yValues[1] - yValues[0],
                count: count
            }
        });
    }

    function ticked() {
        clusterScale = d3.scaleLinear()
            .domain(d3.extent(Object.keys(store.clusterSizes).map(cluster => store.clusterSizes[cluster].count)))
            .range([3,10])

        link
            .attr("x1", d => d.source.x)
            .attr("y1", d => d.source.y)
            .attr("x2", d => d.target.x)
            .attr("y2", d => d.target.y);

        node
            .attr("cx", d => d.x)
            .attr("cy", d => d.y);

        label
            .attr('x', d => d.x)
            .attr('y', d => d.y);

        cluster
            .attr('x', d => (store.clusterSizes[d].minX + (store.clusterSizes[d].width) / 2))
            .attr('y', d => (store.clusterSizes[d].minY + (store.clusterSizes[d].height) / 2))
            .style('font-size', d => `${clusterScale(store.clusterSizes[d].count)}rem`);

    }

    console.log('setting up simulation...')

    linkForce = d3.forceLink()
        .id(d => d.id)
        .links(store.edges)
        // .strength(link=>link.weight);

    simulation = d3.forceSimulation(store.nodes).on("tick", ticked);
    linkCharge = simulation.force("link", linkForce);
    chargeForce = simulation.force("charge", d3.forceManyBody().strength(-1000));         // This adds repulsion between nodes. Play with the -400 for the repulsion strength
    centerForce = simulation.force("center", d3.forceCenter(width / 2, height / 2));     // This force attracts nodes to the center of the svg area
    clusteringForce = simulation.force('cluster', clustering);

    console.log('simulation finished...')

    d3.select('svg')
        // .on('mouseover', (evt) => {console.log(`[${evt.clientX}, ${evt.clientY}]`)})
        .call(d3.zoom().on("zoom", function (evt) {
            g.attr("transform", evt.transform)
        }))
})