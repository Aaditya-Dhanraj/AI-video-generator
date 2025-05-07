import React, {useState} from 'react'
import '../App.css';
import axiosInstance from '../axiosInstance';

const Folder = ({ dataTree, handleInsertNode, handleDeleteNode }) => {

    const [showInput, setShowInput] = useState({
        visible: false,
        isFolder: null,
    });

    const [expand, setExpand] = useState(false);

    const handleNewFolder = (e, isFolder) => {
        e.stopPropagation();

        setExpand(true);

        setShowInput({
            visible: true,
            isFolder,
        })
    }

    const onAddFolder = async (e) =>{
        if (e.keyCode === 13 && e.target.value) {
            await handleInsertNode(dataTree.id, e.target.value, showInput.isFolder)
            setShowInput({...showInput, visible: false});
        }
    }

    async function onFileAdd (e) {
        const fileToAdd = e?.target?.files[0];
        // console.log(fileToAdd, '@@@@@@@@@');
        if (fileToAdd) {
            const formData = new FormData();
            formData.append('file', fileToAdd);

            const res = await axiosInstance.post('/files/upload', formData);
            const fileUrl = res?.data?.fileName;

            await handleInsertNode(dataTree.id, fileUrl, showInput.isFolder)
            setShowInput({...showInput, visible: false});
        }
    }

    async function handleFileClick (e, fileName) {
        e.stopPropagation();
        const res = await axiosInstance.get(`/files/${fileName}`);
        const fileDownloadUrl = res?.data?.url;
        window.open(fileDownloadUrl, '_blank');
    }

    async function handleFileDelete (e, fileName, id) {
        e.stopPropagation();
        await handleDeleteNode(id);
        setShowInput({...showInput, visible: false});
        await axiosInstance.delete(`/files/${fileName}`);
    }

    if (dataTree?.isFolder) {
        return (
            <div className='mt-1.5 folderMain'>
                <div className='mt-1.5 bg-[#E9E9E9] flex justify-between p-1 w-80 cursor-pointer Folder' onClick={()=> setExpand(!expand)}>
                    <span className='mt-0 mr-1 mb-0.5 ml-0'>📁 {dataTree.name}</span>
                    <div>
                        <button className='text-sm bg-white' onClick={(e)=>handleNewFolder(e, true)}>Folder +</button>
                        <button className='text-sm bg-white' onClick={(e)=>handleNewFolder(e, false)}>File +</button>
                    </div>
                </div>
        
                <div style={{display: expand ? 'block': 'none', paddingLeft: 25}}>
                    {
                        showInput.visible && (
                            <div className='flex items-center gap-1 inputContainer'>
                                <span className='mt-1'>{showInput.isFolder ? '📁' : '🟦'}</span>
                                {showInput.isFolder ? (<input
                                onKeyDown={(e)=> onAddFolder(e)}
                                className='mt-1.5 mb-0 mx-0 p-1 flex border border-[#D3D3D3] justify-between cursor-pointer inputContainer__input'
                                autoFocus
                                onBlur={()=>setShowInput({...showInput, visible: false})} />) 
                                : (
                                    <input
                                     onChange={onFileAdd}
                                     type="file"
                                     accept=".gif,.jpg,.jpeg,.png,.doc,.docx,.pdf"
                                     className='mt-1.5 mb-0 mx-0 p-1 flex border border-[#D3D3D3] justify-between cursor-pointer inputContainer__input'
                                     />
                                )
                                }
                            </div>
                        )
                    }
                    {dataTree.items.map((item, idx) => {
                        return (
                            <Folder key={idx+item.id} dataTree={item} handleInsertNode={handleInsertNode} handleDeleteNode={handleDeleteNode} />
                        )
                    })}
                </div>
            </div>
          )
      } else {
        return (
            <div className='flex justify-start items-center gap-2 file__container'>
                <span className='mt-1 pl-1 flex flex-col File' onClick={(e)=>handleFileClick(e, dataTree.name)}>🟦 {dataTree.name.slice(30)}</span>
                <button className='flex justify-center items-center mt-2 cursor-pointer' onClick={(e)=>handleFileDelete(e, dataTree.name, dataTree.id)}>🗑️</button>
            </div>
        )
      }
}

export default Folder