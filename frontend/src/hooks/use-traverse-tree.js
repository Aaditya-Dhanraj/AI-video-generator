const useTraverseTree = () => {
    function insertNode(tree, folderId, item, isFolder) {
        if(tree.id === folderId && tree.isFolder) {
            tree.items.unshift({
                id: Date.now(),
                name: item,
                isFolder,
                items: [],
            });
            return tree;
        }
        
        let latestNode = [];
        latestNode = tree.items.map((obj)=>{
            return insertNode(obj, folderId, item, isFolder);
        });

        return { ...tree, items: latestNode };
    }

    function deleteNode(tree, nodeId) {
        console.log('foundIt', nodeId);
        if (tree.id === nodeId) {
            return null; 
          }

        if (!tree.items || tree.items.length === 0) {
        return tree;
        }

        const updatedItems = [];

        for (const item of tree.items) {
            const updatedChild = deleteNode(item, nodeId);
            if (updatedChild !== null) {
              updatedItems.push(updatedChild);
            }
          }
          return { ...tree, items: updatedItems };
    }

    return { insertNode, deleteNode };
};

export default useTraverseTree;
